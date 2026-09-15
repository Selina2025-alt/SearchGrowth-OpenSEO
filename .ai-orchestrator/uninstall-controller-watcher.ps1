[CmdletBinding()]
param([string]$ConfigPath = (Join-Path $PSScriptRoot "controller-watcher.config.json"))

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
try {
  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $existing = Get-ScheduledTask -TaskName $config.scheduler.taskName -ErrorAction SilentlyContinue
  if ($null -ne $existing) { Unregister-ScheduledTask -TaskName $config.scheduler.taskName -Confirm:$false }
  [pscustomobject]@{ watcherStatus = "NOT_ACTIVE"; taskScheduler = "REMOVED"; taskName = $config.scheduler.taskName } | ConvertTo-Json -Compress
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}