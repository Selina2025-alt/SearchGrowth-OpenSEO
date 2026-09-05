param(
  [string]$Version = "3.2.15",
  [switch]$DiscoverLatest
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Require-Command node
Require-Command npm
Require-Command npx

Write-Host "Node: $(node --version)"
Write-Host "npm : $(npm --version)"

if ($DiscoverLatest) {
  Write-Warning "Discovery mode only. Do not use an untested latest version directly in production."
  $candidate = (npm view @yixiaoermail/cli version).Trim()
  if (-not $candidate) { throw "Could not discover npm version." }
  Write-Host "Discovered npm candidate: $candidate"
  $Version = $candidate
}

# Pin the candidate. If registry does not contain this exact GitHub release version,
# STOP rather than silently falling back to latest.
$resolved = ""
try {
  $resolved = (npm view "@yixiaoermail/cli@$Version" version).Trim()
} catch {
  throw "Exact yxer npm version $Version is not available from the configured registry. Do not silently install latest. Choose a reviewed candidate and rerun."
}
if ($resolved -ne $Version) {
  throw "Registry resolved $resolved, expected $Version."
}

Write-Host "Installing exact @yixiaoermail/cli@$Version ..."
npm install -g "@yixiaoermail/cli@$Version"

Require-Command yxer
Write-Host "yxer version:"
yxer --version

# Sync the bundled formal skill. This is installation-time, not production auto-update.
yxer skill sync --global

Write-Host "Running doctor (may require API key/config for full checks)..."
yxer doctor

Write-Host ""
Write-Host "Installed candidate $Version. Do not run 'yxer update' in production automatically."
Write-Host "Next: configure API key if needed and run smoke-yxer-windows.ps1."
