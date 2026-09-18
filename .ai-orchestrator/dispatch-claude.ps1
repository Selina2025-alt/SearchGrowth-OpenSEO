param(
  [Parameter(Mandatory=$true)][string]$TaskId,
  [int]$Round = 1
)
$ErrorActionPreference = "Stop"

function Resolve-ClaudeCommand {
  foreach($name in @("claude.cmd","claude.exe","claude")){
    $cmd=Get-Command $name -ErrorAction SilentlyContinue
    if($cmd){
      # The npm .cmd shim forwards `%*` through cmd.exe. Windows PowerShell 5
      # then mangles allowlist arguments containing parentheses, so Claude sees
      # the tools but not their grants. Prefer the shim's native executable.
      if($cmd.Source -like "*.cmd"){
        $nativePath=Join-Path (Split-Path $cmd.Source -Parent) "node_modules\@anthropic-ai\claude-code\bin\claude.exe"
        if(Test-Path $nativePath){return Get-Command $nativePath}
      }
      return $cmd
    }
  }
  throw "Claude Code CLI not found. Run probe-environment.ps1."
}

$root=(& git rev-parse --show-toplevel).Trim()
Set-Location $root
$config=Get-Content ".ai-orchestrator\config.json" -Raw | ConvertFrom-Json
if($Round -lt 1 -or $Round -gt [int]$config.maxExecutorRounds){throw "Round outside configured range"}

$claudeCmd=Resolve-ClaudeCommand
$worktree=& "$PSScriptRoot\create-task-worktree.ps1" -TaskId $TaskId | Select-Object -Last 1
$worktree=[string]$worktree

$taskPath=Join-Path $worktree "control\tasks\$TaskId\TASK.md"
if(-not(Test-Path $taskPath)){throw "Task missing in worktree: $taskPath"}

# The controller may refine an existing task packet while repairing executor
# infrastructure. Refresh it before every dispatch; worktree creation only
# copies the initial version.
$controllerTaskPath=Join-Path $root "control\tasks\$TaskId\TASK.md"
if(-not(Test-Path $controllerTaskPath)){throw "Controller task missing: $controllerTaskPath"}
Copy-Item $controllerTaskPath $taskPath -Force

$reviewSource=Join-Path $root "control\tasks\$TaskId\REVIEW.md"
if(Test-Path $reviewSource){
  $reviewTargetDir=Join-Path $worktree "control\tasks\$TaskId"
  New-Item -ItemType Directory -Force -Path $reviewTargetDir|Out-Null
  Copy-Item $reviewSource (Join-Path $reviewTargetDir "REVIEW.md") -Force
}

$runDir=Join-Path $root "control\tasks\$TaskId\runs"
New-Item -ItemType Directory -Force -Path $runDir|Out-Null
$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$stdoutFile=Join-Path $runDir ("claude-round-{0}-{1}.stdout.json" -f $Round,$stamp)
$stderrFile=Join-Path $runDir ("claude-round-{0}-{1}.stderr.log" -f $Round,$stamp)

$instruction=@"
You are the Implementation Engineer for Search Growth V1.0.
Read root CLAUDE.md and control/tasks/$TaskId/TASK.md.
This is implementation round $Round.
If REVIEW.md exists, address its findings.
On this Windows Git Bash executor, invoke every TASK-approved pnpm command as `corepack pnpm ...`; bare `pnpm` is not on PATH. Run each required command independently and capture its result without wrapping it in chained shell operations.
The current TASK.md, REVIEW.md when present, native executable, and task-scoped grants are authoritative. Do not rely on stale executor memory from another task or round.
Implement only this task, run required tests, write control/tasks/$TaskId/DELIVERY.md, and stop.
Do not merge, do not edit REVIEW.md, do not begin another task, and do not run production publishing.
"@

Push-Location $worktree
try{
  # Avoid PowerShell's automatic `$args` variable; using it as a mutable
  # command array can silently discard appended permission grants.
  # A named print session must not invoke Claude Code's automatic session-title
  # helper. The DeepSeek route can render that helper's model label with an ANSI
  # style suffix (for example, `deepseek-v4-Pro[1m]`), which the provider then
  # rejects before executor work starts. The explicit task name is display-only;
  # the configured `--model` argument remains the authoritative executor model.
  [string[]]$claudeArgs = @("-p",$instruction,"--name","SearchGrowth $TaskId Round $Round","--output-format",[string]$config.claude.outputFormat,"--max-turns",[string]$config.claude.maxTurns)
  foreach($extraArg in $config.claude.extraArgs){
    $claudeArgs += [string]$extraArg
  }
  Write-Host "Claude controls: $($claudeArgs[2..($claudeArgs.Count-1)] -join ' ')"

  # Keep stdout/stderr separate. Custom DeepSeek routing can emit non-fatal
  # model/session-title warnings on stderr that would corrupt JSON if merged.
  # Claude's configured DeepSeek route can emit a non-fatal model/session-title
  # warning on stderr. PowerShell treats native stderr as a terminating
  # NativeCommandError under ErrorActionPreference=Stop, even when the process
  # exits 0. Temporarily allow native stderr so we can inspect the real exit
  # code and retain the warning in the dedicated stderr log.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $claudeCmd.Source @claudeArgs 1>$stdoutFile 2>$stderrFile
    $exitCode=$LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if($exitCode -ne 0){throw "Claude executor exited with code $exitCode. See $stderrFile"}
}finally{
  Pop-Location
}

$deliveryInWorktree=Join-Path $worktree "control\tasks\$TaskId\DELIVERY.md"
if(-not(Test-Path $deliveryInWorktree)){throw "Claude completed without DELIVERY.md. Inspect $stdoutFile and $stderrFile"}

$controllerTaskDir=Join-Path $root "control\tasks\$TaskId"
New-Item -ItemType Directory -Force -Path $controllerTaskDir|Out-Null
Copy-Item $deliveryInWorktree (Join-Path $controllerTaskDir "DELIVERY.md") -Force

Write-Host "Claude round $Round finished."
Write-Host "Command: $($claudeCmd.Source)"
Write-Host "Worktree: $worktree"
Write-Host "Delivery: $(Join-Path $controllerTaskDir 'DELIVERY.md')"
Write-Host "stdout: $stdoutFile"
Write-Host "stderr: $stderrFile"
