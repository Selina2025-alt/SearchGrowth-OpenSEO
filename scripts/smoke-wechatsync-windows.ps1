param(
  [string]$ArticlePath,
  [string]$Platforms = "zhihu,juejin,csdn",
  [switch]$ExecuteDraftSmoke
)
$ErrorActionPreference = "Stop"

if (-not (Get-Command wechatsync -ErrorAction SilentlyContinue)) {
  throw "wechatsync CLI not installed."
}

wechatsync --version
wechatsync --help | Out-Host

if (-not $ArticlePath) {
  Write-Host "CLI smoke passed. Supply -ArticlePath to test a content file."
  exit 0
}
if (-not (Test-Path -LiteralPath $ArticlePath)) { throw "Article not found: $ArticlePath" }

Write-Host "Dry run:"
wechatsync sync $ArticlePath --platforms $Platforms --dry-run | Out-Host

if (-not $ExecuteDraftSmoke) {
  Write-Host "No remote draft created. Re-run with -ExecuteDraftSmoke after normal browser login and approval."
  exit 0
}

Write-Warning "This will create remote platform drafts using the authenticated Chrome extension."
wechatsync platforms --auth | Out-Host
wechatsync sync $ArticlePath --platforms $Platforms | Out-Host

Write-Host ""
Write-Host "IMPORTANT: CLI stdout is only smoke evidence. Production DraftStager must use the structured MCP/Extension result to retain postId/draftId."
