param(
  [string]$IntegrationBranch = "integration/ai-v1"
)
$ErrorActionPreference = "Stop"

$root = (& git rev-parse --show-toplevel).Trim()
Set-Location $root

git rev-parse --verify HEAD *> $null

$exists = $false
git show-ref --verify --quiet "refs/heads/$IntegrationBranch"
if ($LASTEXITCODE -eq 0) { $exists = $true }

if (-not $exists) {
  git branch $IntegrationBranch HEAD
  Write-Host "Created $IntegrationBranch from current HEAD."
} else {
  Write-Host "$IntegrationBranch already exists."
}
