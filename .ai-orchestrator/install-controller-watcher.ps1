[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot "controller-watcher.config.json"),
  [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-WindowsCommandLineArgument {
  param([AllowEmptyString()][string]$Argument)
  if ($Argument.Length -eq 0) { return '""' }
  if ($Argument -notmatch '[\s"]') { return $Argument }

  $builder = New-Object System.Text.StringBuilder
  [void]$builder.Append('"')
  $backslashCount = 0
  foreach ($character in $Argument.ToCharArray()) {
    if ($character -eq [char]'\') { $backslashCount++; continue }
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

function Invoke-ProcessWithEof {
  param([string]$FileName, [string[]]$Arguments)
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $FileName
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.Arguments = (($Arguments | ForEach-Object { ConvertTo-WindowsCommandLineArgument ([string]$_) }) -join ' ')
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $info
  if (-not $process.Start()) { throw "Process did not start: $FileName" }
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout.GetAwaiter().GetResult(); Stderr = $stderr.GetAwaiter().GetResult() }
}

try {
  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $watcherPath = Join-Path $PSScriptRoot "controller-watcher.ps1"
  $testPath = Join-Path $PSScriptRoot "tests\controller-watcher.tests.ps1"
  if (-not (Test-Path -LiteralPath $watcherPath)) { throw "Watcher script is missing: $watcherPath" }
  $codexCommand = Get-Command codex.exe -ErrorAction Stop
  $codexPath = $codexCommand.Source
  $version = Invoke-ProcessWithEof $codexPath @("--version")
  if ($version.ExitCode -ne 0) { throw "Codex version probe failed: $($version.Stderr)" }
  $help = Invoke-ProcessWithEof $codexPath @("exec", "--help")
  if ($help.ExitCode -ne 0 -or $help.Stdout -notmatch "--model" -or $help.Stdout -notmatch "--cd" -or $help.Stdout -notmatch "--sandbox") { throw "Codex exec capability probe failed; required CLI parameters are unavailable." }
  $config.codex.executablePath = $codexPath
  $config.codex.observedVersion = $version.Stdout.Trim()
  $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
  if (-not $SkipTests) { & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $testPath -ConfigPath $ConfigPath; if ($LASTEXITCODE -ne 0) { throw "Watcher dry-run test suite failed." } }

  $powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
  $arguments = ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -ConfigPath "{1}"' -f $watcherPath, $ConfigPath)
  $action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -Daily -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes ([int]$config.scheduler.intervalMinutes)) -RepetitionDuration (New-TimeSpan -Days 1)
  $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds ([int]$config.scheduler.executionTimeoutSeconds)) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $config.scheduler.taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  [pscustomobject]@{ watcherStatus = "ACTIVE"; taskScheduler = "INSTALLED"; taskName = $config.scheduler.taskName; intervalMinutes = $config.scheduler.intervalMinutes; codexPath = $config.codex.executablePath; controllerModel = $config.codex.controllerModel; cliVersion = $config.codex.observedVersion } | ConvertTo-Json -Compress
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
