[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "controller-watcher.config.json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-That {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

$orchestrator = Split-Path -Parent $PSScriptRoot
$watcher = Join-Path $orchestrator "controller-watcher.ps1"
$runner = Join-Path $orchestrator "run-controller.ps1"
$installer = Join-Path $orchestrator "install-controller-watcher.ps1"
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json

foreach ($path in @($watcher, $runner, $installer, $PSCommandPath)) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
  $errorMessages = (@($errors | ForEach-Object { $_.Message }) -join '; ')
  Assert-That ($errors.Count -eq 0) "PowerShell parser errors in ${path}: $errorMessages"
}

Assert-That ([System.IO.Path]::IsPathRooted([string]$config.codex.executablePath)) "Codex executable must be absolute."
Assert-That (Test-Path -LiteralPath $config.codex.executablePath) "Configured Codex executable is missing."
Assert-That ([string]$config.codex.controllerModel -match "(?i)terra") "Daily controller model must be Terra."
Assert-That ([string]$config.codex.controllerModel -notmatch "(?i)sol") "Watcher must not default to Sol."
Assert-That ($config.codex.allowModelFallback -eq $false) "Automatic model fallback must be disabled."
foreach ($safety in @("allowMainMerge", "allowProductionPublish", "allowPaidSpend", "allowDestructiveOperation")) {
  Assert-That ($config.safety.$safety -eq $false) "Safety flag '$safety' must remain false."
}

$fixtures = @(
  @{ Name = "ClaudeRunning"; State = "CLAUDE_RUNNING"; Action = "EXIT"; Codex = $false },
  @{ Name = "DeliveryNewer"; State = "NEEDS_FAST_REVIEW"; Action = "INVOKE_CONTROLLER"; Codex = $true },
  @{ Name = "DeliveryAlreadyHandled"; State = "NEEDS_FAST_REVIEW"; Action = "SUPPRESS_ALREADY_HANDLED"; Codex = $false },
  @{ Name = "ReviewNewer"; State = "NO_ACTION"; Action = "EXIT"; Codex = $false },
  @{ Name = "NoDelivery429"; State = "NEEDS_EXECUTOR_RECOVERY"; Action = "INVOKE_CONTROLLER"; Codex = $true },
  @{ Name = "NoDeliveryMaxTurns"; State = "NEEDS_EXECUTOR_RECOVERY"; Action = "INVOKE_CONTROLLER"; Codex = $true },
  @{ Name = "BlockedRound1"; State = "NEEDS_FIX_ROUND"; Action = "INVOKE_CONTROLLER"; Codex = $true },
  @{ Name = "BlockedRound3"; State = "ROUND_LIMIT_HUMAN_GATE"; Action = "WRITE_HUMAN_GATE"; Codex = $false },
  @{ Name = "HumanGate"; State = "HUMAN_GATE"; Action = "EXIT"; Codex = $false },
  @{ Name = "StaleGitLock"; State = "STALE_GIT_LOCK"; Action = "WRITE_HUMAN_GATE"; Codex = $false }
)

$results = @()
foreach ($fixture in $fixtures) {
  $json = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $watcher -ConfigPath $ConfigPath -DryRun -Fixture $fixture.Name -AsJson
  Assert-That ($LASTEXITCODE -eq 0) "Fixture '$($fixture.Name)' exited $LASTEXITCODE."
  $actual = $json | ConvertFrom-Json
  Assert-That ($actual.detectedState -eq $fixture.State) "Fixture '$($fixture.Name)' state '$($actual.detectedState)' expected '$($fixture.State)'."
  Assert-That ($actual.action -eq $fixture.Action) "Fixture '$($fixture.Name)' action '$($actual.action)' expected '$($fixture.Action)'."
  Assert-That ([bool]$actual.codexInvoked -eq $fixture.Codex) "Fixture '$($fixture.Name)' Codex invocation plan mismatched."
  $results += $actual
}

$runnerJson = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -ConfigPath $ConfigPath -TaskId "T-FIXTURE" -DetectedState "NEEDS_FAST_REVIEW" -DryRun
Assert-That ($LASTEXITCODE -eq 0) "Runner dry run exited $LASTEXITCODE."
$runnerResult = $runnerJson | ConvertFrom-Json
Assert-That ($runnerResult.model -eq $config.codex.controllerModel) "Runner changed the configured controller model."
Assert-That ($runnerResult.stdin -eq "explicit EOF") "Runner does not declare explicit stdin EOF."
Assert-That ($runnerResult.sandbox -eq "workspace-write") "Runner sandbox changed."

[pscustomobject]@{
  status = "PASS"
  fixtureCount = $fixtures.Count
  codexInvocationPlans = @($results | Where-Object { $_.codexInvoked }).Count
  zeroModelFixtures = @($results | Where-Object { -not $_.codexInvoked }).Count
  noStateChangeCodexInvocations = @($results | Where-Object { $_.detectedState -in @("CLAUDE_RUNNING", "NO_ACTION", "HUMAN_GATE") -and $_.codexInvoked }).Count
  runner = $runnerResult
} | ConvertTo-Json -Compress
