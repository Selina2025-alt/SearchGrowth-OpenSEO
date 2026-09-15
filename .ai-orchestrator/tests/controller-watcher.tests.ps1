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
$configForTests = $ConfigPath
$config = Get-Content -LiteralPath $configForTests -Raw | ConvertFrom-Json

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

# A real checkpoint context must expose the same replay-suppression field as
# dry-run fixtures; strict mode otherwise fails before it can decide safely.
. $watcher -ConfigPath $configForTests
$liveContext = Get-WatcherContext $config
Assert-That ($null -ne $liveContext.PSObject.Properties["PriorHandled"]) "Live watcher context must define PriorHandled."
Assert-That ($liveContext.PriorHandled -eq $false) "Live watcher context must default PriorHandled to false."

$fixtureCases = @(
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
foreach ($case in $fixtureCases) {
  $json = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $watcher -ConfigPath $configForTests -DryRun -Fixture $case.Name -AsJson
  Assert-That ($LASTEXITCODE -eq 0) "Fixture '$($case.Name)' exited $LASTEXITCODE."
  $actual = $json | ConvertFrom-Json
  Assert-That ($actual.detectedState -eq $case.State) "Fixture '$($case.Name)' state '$($actual.detectedState)' expected '$($case.State)'."
  Assert-That ($actual.action -eq $case.Action) "Fixture '$($case.Name)' action '$($actual.action)' expected '$($case.Action)'."
  Assert-That ([bool]$actual.codexInvoked -eq $case.Codex) "Fixture '$($case.Name)' Codex invocation plan mismatched."
  $results += $actual
}

$runnerJson = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -ConfigPath $configForTests -TaskId "T-FIXTURE" -DetectedState "NEEDS_FAST_REVIEW" -DryRun
Assert-That ($LASTEXITCODE -eq 0) "Runner dry run exited $LASTEXITCODE."
$runnerResult = $runnerJson | ConvertFrom-Json
Assert-That ($runnerResult.model -eq $config.codex.controllerModel) "Runner changed the configured controller model."
Assert-That ($runnerResult.stdin -eq "explicit EOF") "Runner does not declare explicit stdin EOF."
Assert-That ($runnerResult.sandbox -eq "workspace-write") "Runner sandbox changed."

[pscustomobject]@{
  status = "PASS"
  fixtureCount = $fixtureCases.Count
  codexInvocationPlans = @($results | Where-Object { $_.codexInvoked }).Count
  zeroModelFixtures = @($results | Where-Object { -not $_.codexInvoked }).Count
  noStateChangeCodexInvocations = @($results | Where-Object { $_.detectedState -in @("CLAUDE_RUNNING", "NO_ACTION", "HUMAN_GATE") -and $_.codexInvoked }).Count
  runner = $runnerResult
} | ConvertTo-Json -Compress
