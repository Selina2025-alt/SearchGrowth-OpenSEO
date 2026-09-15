[CmdletBinding()]
param(
  [string]$ConfigPath,
  [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$scriptDirectory = Split-Path -Parent $PSCommandPath
if ([string]::IsNullOrWhiteSpace($scriptDirectory)) { throw "Unable to resolve the watcher installer script directory." }
if ([string]::IsNullOrWhiteSpace($ConfigPath)) { $ConfigPath = Join-Path $scriptDirectory "controller-watcher.config.json" }

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
  $resolvedConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
  $configText = Get-Content -LiteralPath $resolvedConfigPath -Raw
  $config = $configText | ConvertFrom-Json
  $watcherPath = Join-Path $scriptDirectory "controller-watcher.ps1"
  $testPath = Join-Path $scriptDirectory "tests\controller-watcher.tests.ps1"
  if (-not (Test-Path -LiteralPath $watcherPath)) { throw "Watcher script is missing: $watcherPath" }
  $codexCommand = Get-Command codex.exe -ErrorAction Stop
  $codexPath = $codexCommand.Source
  $version = Invoke-ProcessWithEof $codexPath @("--version")
  if ($version.ExitCode -ne 0) { throw "Codex version probe failed: $($version.Stderr)" }
  $help = Invoke-ProcessWithEof $codexPath @("exec", "--help")
  if ($help.ExitCode -ne 0 -or $help.Stdout -notmatch "--model" -or $help.Stdout -notmatch "--cd" -or $help.Stdout -notmatch "--sandbox") { throw "Codex exec capability probe failed; required CLI parameters are unavailable." }
  $detectedVersion = $version.Stdout.Trim()
  # Do not churn the tracked configuration on every scheduled-task refresh.
  # A rewrite is needed only when discovery finds a different absolute binary/version.
  if ($config.codex.executablePath -ne $codexPath -or $config.codex.observedVersion -ne $detectedVersion) {
    $config.codex.executablePath = $codexPath
    $config.codex.observedVersion = $detectedVersion
    $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedConfigPath -Encoding UTF8
  }
  if (-not $SkipTests) { & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $testPath -ConfigPath $resolvedConfigPath; if ($LASTEXITCODE -ne 0) { throw "Watcher dry-run test suite failed." } }

  $powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
  $arguments = ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -ConfigPath "{1}"' -f $watcherPath, $resolvedConfigPath)
  $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  # The ScheduledTasks cmdlet supports repetition only for a one-time trigger.
  # Use the native task XML CalendarTrigger so every Windows version gets a
  # daily trigger with a durable ten-minute repetition pattern.
  $escape = { param([string]$Value) [System.Security.SecurityElement]::Escape($Value) }
  $startBoundary = (Get-Date).AddMinutes(1).ToString("s")
  $interval = "PT{0}M" -f [int]$config.scheduler.intervalMinutes
  $timeout = "PT{0}S" -f [int]$config.scheduler.executionTimeoutSeconds
  $taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$startBoundary</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition><Interval>$interval</Interval><Duration>P1D</Duration><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="WatcherUser"><UserId>$(& $escape $user)</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>$timeout</ExecutionTimeLimit>
  </Settings>
  <Actions Context="WatcherUser"><Exec><Command>$(& $escape $powershellPath)</Command><Arguments>$(& $escape $arguments)</Arguments></Exec></Actions>
</Task>
"@
  Register-ScheduledTask -TaskName $config.scheduler.taskName -Xml $taskXml -Force | Out-Null
  [pscustomobject]@{ watcherStatus = "ACTIVE"; taskScheduler = "INSTALLED"; taskName = $config.scheduler.taskName; intervalMinutes = $config.scheduler.intervalMinutes; codexPath = $config.codex.executablePath; controllerModel = $config.codex.controllerModel; cliVersion = $config.codex.observedVersion } | ConvertTo-Json -Compress
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
