param([string]$Version = "1.1.0")
$ErrorActionPreference = "Stop"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm not found" }

$resolved = (npm view "@wechatsync/cli@$Version" version).Trim()
if ($resolved -ne $Version) { throw "Expected @wechatsync/cli@$Version, registry resolved '$resolved'." }

npm install -g "@wechatsync/cli@$Version"
wechatsync --version
Write-Host "Install/enable the Chrome extension and MCP bridge, then set its required token/config."
Write-Host "Run smoke-wechatsync-windows.ps1 next."
