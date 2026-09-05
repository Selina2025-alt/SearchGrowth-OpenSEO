param(
  [string]$Platform = "知乎",
  [ValidateSet("article","imageText","video")]
  [string]$PublishType = "article",
  [string]$PayloadPath = "",
  [string]$ContentFile = "",
  [switch]$AllowRealPublish
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command yxer -ErrorAction SilentlyContinue)) {
  throw "yxer not installed."
}

$report = [ordered]@{
  startedAt = (Get-Date).ToString("o")
  version = $null
  doctor = $false
  accounts = $false
  prepare = $false
  schemaFields = $false
  validate = $false
  dryRun = $false
  realPublishAttempted = $false
  taskSetId = $null
  finalStatusChecked = $false
  notes = @()
}

try {
  $report.version = (yxer --version | Out-String).Trim()
  yxer doctor | Out-Host
  $report.doctor = $true

  yxer accounts list $Platform --status 1 --json | Out-Host
  $report.accounts = $true

  yxer prepare $Platform $PublishType | Out-Host
  $report.prepare = $true

  yxer schema fields $Platform $PublishType | Out-Host
  $report.schemaFields = $true

  if (-not $PayloadPath) {
    $report.notes += "No payload supplied. Environment/schema smoke completed; validate/publish skipped."
  } else {
    if (-not (Test-Path -LiteralPath $PayloadPath)) { throw "Payload not found: $PayloadPath" }

    $validateArgs = @("validate", $Platform, $PublishType, $PayloadPath)
    if ($ContentFile) { $validateArgs += @("--content-file", $ContentFile) }
    & yxer @validateArgs | Out-Host
    $report.validate = $true

    $publishArgs = @("publish", $PublishType, $Platform, $PayloadPath)
    if ($ContentFile) { $publishArgs += @("--content-file", $ContentFile) }
    $dryArgs = $publishArgs + "--dry-run"
    & yxer @dryArgs | Out-Host
    $report.dryRun = $true

    if ($AllowRealPublish) {
      Write-Warning "REAL PUBLISH requested. This script does not treat command acceptance as final success."
      $report.realPublishAttempted = $true
      $raw = (& yxer @publishArgs | Out-String)
      $raw | Write-Host

      # Do not blindly parse human text as final success.
      # User/operator should prefer --json when the installed version exposes it.
      # Extract a taskSetId only as an aid; terminal check is mandatory.
      if ($raw -match '"?taskSetId"?\s*[:=]\s*"?([A-Za-z0-9_\-]+)"?') {
        $taskSetId = $Matches[1]
        $report.taskSetId = $taskSetId
        Write-Host "Remote task accepted: $taskSetId"
        Write-Host "Querying details; task acceptance is NOT publication success."
        yxer query details $taskSetId --json | Out-Host
        $report.finalStatusChecked = $true
      } else {
        $report.notes += "Real publish returned no reliably parsed taskSetId. Treat as REMOTE_STATE_UNKNOWN; do NOT retry blindly."
      }
    }
  }
}
finally {
  $report.finishedAt = (Get-Date).ToString("o")
  $out = Join-Path (Get-Location) "yxer-smoke-report.json"
  $report | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $out
  Write-Host "Smoke report: $out"
}
