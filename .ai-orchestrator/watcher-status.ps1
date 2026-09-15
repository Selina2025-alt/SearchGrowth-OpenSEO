[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot "controller-watcher.config.json"),
  [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $runtimeDirectory = if ([System.IO.Path]::IsPathRooted($config.watcher.runtimeDirectory)) {
    $config.watcher.runtimeDirectory
  } else {
    Join-Path $config.repositoryRoot $config.watcher.runtimeDirectory
  }
  $jsonPath = Join-Path $runtimeDirectory "STATUS.json"
  $textPath = Join-Path $runtimeDirectory "STATUS.txt"
  if (-not (Test-Path -LiteralPath $jsonPath)) {
    $status = [ordered]@{
      watcherStatus = "STATUS_NOT_YET_WRITTEN"
      schedule = "every $($config.scheduler.intervalMinutes) minutes"
      currentTask = $null
      currentRound = $null
      currentState = "UNKNOWN"
      claudeRunning = $null
      lastWatcherCheck = $null
      lastDelivery = $null
      lastReview = $null
      lastPassMergeCommit = $null
      lastControllerAction = $null
      nextAction = "Await the next local watcher check."
      humanActionRequired = $false
      failure = $null
    }
    if ($AsJson) { $status | ConvertTo-Json -Depth 5 } else { "WATCHER_STATUS: STATUS_NOT_YET_WRITTEN`nNEXT_ACTION: Await the next local watcher check." }
    exit 0
  }
  if ($AsJson) { Get-Content -LiteralPath $jsonPath -Raw; exit 0 }
  Get-Content -LiteralPath $textPath -Raw
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
