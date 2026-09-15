[CmdletBinding()]
param(
  [string]$ConfigPath,
  [Parameter(Mandatory = $true)][string]$TaskId,
  [Parameter(Mandatory = $true)][ValidateSet("NEEDS_FAST_REVIEW", "NEEDS_EXECUTOR_RECOVERY", "NEEDS_FIX_ROUND")][string]$DetectedState,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$scriptDirectory = Split-Path -Parent $PSCommandPath
if ([string]::IsNullOrWhiteSpace($scriptDirectory)) { throw "Unable to resolve the Controller runner script directory." }
if ([string]::IsNullOrWhiteSpace($ConfigPath)) { $ConfigPath = Join-Path $scriptDirectory "controller-watcher.config.json" }

function Get-RunnerConfig {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { throw "Watcher config does not exist: $Path" }
  $config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  if (-not (Test-Path -LiteralPath $config.repositoryRoot)) { throw "Repository root is unavailable: $($config.repositoryRoot)" }
  if (-not (Test-Path -LiteralPath $config.codex.executablePath)) { throw "Configured Codex executable is unavailable: $($config.codex.executablePath)" }
  if ($config.codex.controllerModel -notmatch "(?i)terra") { throw "Configured controller model is not the approved economy-tier Terra model." }
  if ($config.codex.allowModelFallback -ne $false) { throw "Automatic controller-model fallback is prohibited." }
  return $config
}

function Get-ControllerPrompt {
  param([string]$Task, [string]$State)
  $stateInstruction = switch ($State) {
    "NEEDS_FAST_REVIEW" { "Perform the existing targeted Fast Review for the newer DELIVERY. If and only if it passes, write REVIEW, merge only ai-task/$Task to integration/ai-v1, update PROJECT_STATE and ACCEPTANCE_LEDGER, then create and dispatch the next approved small task. If a real defect exists, write a bounded BLOCKED review and dispatch only the next allowed fix round. Do not rerun expensive gates already evidenced unless evidence conflicts." }
    "NEEDS_EXECUTOR_RECOVERY" { "Inspect the newest task run evidence. If and only if it is a listed executor infrastructure interruption, preserve the worktree and dispatch the same-round continuation. Do not reset work, increase the implementation round, or rewrite business code. If state is ambiguous, write USER_ACTION_REQUIRED and stop." }
    "NEEDS_FIX_ROUND" { "Read the current BLOCKED review and dispatch one bounded next fix round only if the task has fewer than three implementation rounds. Do not implement the fix yourself. At round three or on any Human Gate, write USER_ACTION_REQUIRED and stop." }
  }
  return @"
You are the Search Growth V1.0 Controller running once under a deterministic local watcher.

Trigger: $State
Current task: $Task

Read root AGENTS.md, control/PROJECT_STATE.md, the current TASK, DELIVERY, and REVIEW evidence. $stateInstruction

Apply CLAUDE-FIRST, Fast Review, Token Economy, and Model Economy. Never merge to main. Never perform production publishing, paid actions, credentials/account access, CAPTCHA/2FA work, destructive operations, scope/ADR changes, or acceptance-criteria waivers. Do not modify the Controller Watcher maintenance branch or its files in this invocation. Stop after the bounded controller action is complete.
"@
}

function ConvertTo-WindowsCommandLineArgument {
  param([AllowEmptyString()][string]$Argument)
  if ($Argument.Length -eq 0) { return '""' }
  if ($Argument -notmatch '[\s"]') { return $Argument }

  $builder = New-Object System.Text.StringBuilder
  [void]$builder.Append('"')
  $backslashCount = 0
  foreach ($character in $Argument.ToCharArray()) {
    if ($character -eq [char]'\') {
      $backslashCount++
      continue
    }
    if ($character -eq [char]'"') {
      if ($backslashCount -gt 0) { [void]$builder.Append(('\' * ($backslashCount * 2) -join '')) }
      [void]$builder.Append('\"')
      $backslashCount = 0
      continue
    }
    if ($backslashCount -gt 0) { [void]$builder.Append(('\' * $backslashCount -join '')) }
    [void]$builder.Append($character)
    $backslashCount = 0
  }
  if ($backslashCount -gt 0) { [void]$builder.Append(('\' * ($backslashCount * 2) -join '')) }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Invoke-CodexController {
  param([object]$Config, [string]$Prompt)
  $logDirectory = Join-Path $Config.repositoryRoot $Config.watcher.logDirectory
  New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutPath = Join-Path $logDirectory ("codex-controller-$stamp.stdout.log")
  $stderrPath = Join-Path $logDirectory ("codex-controller-$stamp.stderr.log")
  $lastMessagePath = Join-Path $logDirectory ("codex-controller-$stamp.last-message.md")

  $arguments = @(
    "exec", "--ephemeral", "--color", "never", "--sandbox", [string]$Config.codex.sandbox,
    "--approve-for-me", "--cd", [string]$Config.repositoryRoot,
    "--model", [string]$Config.codex.controllerModel,
    "--config", ('model_reasoning_effort="{0}"' -f [string]$Config.codex.reasoningEffort),
    "--output-last-message", $lastMessagePath,
    $Prompt
  )
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = [string]$Config.codex.executablePath
  $info.WorkingDirectory = [string]$Config.repositoryRoot
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  # Windows PowerShell 5 lacks ProcessStartInfo.ArgumentList. Build a correctly
  # quoted command line so the scheduled powershell.exe invocation stays compatible.
  $info.Arguments = (($arguments | ForEach-Object { ConvertTo-WindowsCommandLineArgument ([string]$_) }) -join ' ')

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $info
  if (-not $process.Start()) { throw "Codex controller process did not start." }
  # Explicit EOF prevents `codex exec` from waiting for non-TTY stdin.
  $process.StandardInput.Close()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $timeoutMilliseconds = [int]$Config.codex.invocationTimeoutSeconds * 1000
  if (-not $process.WaitForExit($timeoutMilliseconds)) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
    Add-Content -LiteralPath $stderrPath -Value "Controller invocation timed out and its process tree was stopped." -Encoding UTF8
    return 124
  }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if (-not [string]::IsNullOrEmpty($stdout)) { Add-Content -LiteralPath $stdoutPath -Value $stdout -Encoding UTF8 }
  if (-not [string]::IsNullOrEmpty($stderr)) { Add-Content -LiteralPath $stderrPath -Value $stderr -Encoding UTF8 }
  return $process.ExitCode
}

try {
  $config = Get-RunnerConfig $ConfigPath
  $prompt = Get-ControllerPrompt $TaskId $DetectedState
  if ($DryRun) {
    [pscustomobject]@{ executable = $config.codex.executablePath; model = $config.codex.controllerModel; reasoningEffort = $config.codex.reasoningEffort; sandbox = $config.codex.sandbox; stdin = "explicit EOF"; state = $DetectedState } | ConvertTo-Json -Compress
    exit 0
  }
  exit (Invoke-CodexController $config $prompt)
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
