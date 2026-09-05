param(
  [string]$TargetDirectory = "",
  [string]$RepositoryUrl = "https://github.com/every-app/open-seo.git",
  [string]$FrozenCommit = "3632f408528cd588fec98c3a174af8ea0ad205e8",
  [switch]$SkipCopyDevpack
)

$ErrorActionPreference = "Stop"

function Require-Command($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "Required command not found: $name" }
  return $cmd
}

$git = Require-Command "git.exe"
$packRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not $TargetDirectory) {
  $TargetDirectory = Join-Path (Split-Path $packRoot -Parent) "SearchGrowth-OpenSEO"
}
$TargetDirectory = [System.IO.Path]::GetFullPath($TargetDirectory)

Write-Host "Development pack root: $packRoot"
Write-Host "Target OpenSEO repo:     $TargetDirectory"
Write-Host "Frozen commit:           $FrozenCommit"

if (Test-Path $TargetDirectory) {
  $items = Get-ChildItem -Force $TargetDirectory -ErrorAction SilentlyContinue
  if ($items.Count -gt 0) {
    throw "Target directory already exists and is not empty: $TargetDirectory"
  }
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $TargetDirectory -Parent) | Out-Null
}

git clone $RepositoryUrl $TargetDirectory
if ($LASTEXITCODE -ne 0) { throw "git clone failed" }

git -C $TargetDirectory checkout $FrozenCommit
if ($LASTEXITCODE -ne 0) { throw "checkout frozen commit failed" }

# Keep a stable integration branch. Do not modify main.
git -C $TargetDirectory branch integration/ai-v1 $FrozenCommit 2>$null

if (-not $SkipCopyDevpack) {
  Write-Host "Overlaying Search Growth development-control files into repository root..."

  # Copy all devpack files into repo root except MANIFEST; reference artifacts remain docs/reference,
  # and are not executed automatically.
  Get-ChildItem -Force $packRoot | ForEach-Object {
    if ($_.Name -eq "MANIFEST.md") { return }
    $dest = Join-Path $TargetDirectory $_.Name
    if ($_.PSIsContainer) {
      Copy-Item $_.FullName $dest -Recurse -Force
    } else {
      Copy-Item $_.FullName $dest -Force
    }
  }
}

# Verify source markers.
$required = @("package.json", "pnpm-lock.yaml", "src")
foreach ($r in $required) {
  if (-not (Test-Path (Join-Path $TargetDirectory $r))) {
    throw "OpenSEO source marker missing after clone: $r"
  }
}

Write-Host ""
Write-Host "BOOTSTRAP_OK"
Write-Host "Repo: $TargetDirectory"
Write-Host "Next:"
Write-Host "  1) Open Codex in this new repository"
Write-Host "  2) Send the text from 40_ONE_MESSAGE_TO_CODEX.md"
Write-Host "  3) Codex should run .ai-orchestrator\probe-environment.ps1"
