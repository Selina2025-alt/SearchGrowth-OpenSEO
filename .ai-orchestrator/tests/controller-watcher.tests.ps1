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
$statusScript = Join-Path $orchestrator "watcher-status.ps1"
$configForTests = $ConfigPath
$config = Get-Content -LiteralPath $configForTests -Raw | ConvertFrom-Json
$fixtureConfigPath = Join-Path ([System.IO.Path]::GetTempPath()) ("search-growth-watcher-fixture-" + [guid]::NewGuid().ToString("N") + ".json")
$fixtureConfig = ($config | ConvertTo-Json -Depth 8 | ConvertFrom-Json)
$fixtureConfig.watcher.mutexName = "Local\SearchGrowth-Controller-Watcher-Test-$PID"
$fixtureConfig | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $fixtureConfigPath -Encoding UTF8

foreach ($path in @($watcher, $runner, $installer, $statusScript, $PSCommandPath)) {
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
Assert-That ($config.codex.useApproveForMe -eq $false) "Sandboxed Controller must not use --approve-for-me."
foreach ($safety in @("allowMainMerge", "allowProductionPublish", "allowPaidSpend", "allowDestructiveOperation")) {
  Assert-That ($config.safety.$safety -eq $false) "Safety flag '$safety' must remain false."
}

# A real checkpoint context must expose the same replay-suppression field as
# dry-run fixtures; strict mode otherwise fails before it can decide safely.
. $watcher -ConfigPath $configForTests
$liveContext = Get-WatcherContext $config
Assert-That ($null -ne $liveContext.PSObject.Properties["PriorHandled"]) "Live watcher context must define PriorHandled."
Assert-That ($liveContext.PriorHandled -eq $false) "Live watcher context must default PriorHandled to false."

$runnerTestDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("search-growth-watcher-runner-" + [guid]::NewGuid().ToString("N"))
$runnerCapture = Join-Path $runnerTestDirectory "capture.json"
try {
  New-Item -ItemType Directory -Force -Path $runnerTestDirectory | Out-Null
  @'
param([string]$ConfigPath, [string]$TaskId, [ValidateSet("NEEDS_FAST_REVIEW", "NEEDS_EXECUTOR_RECOVERY", "NEEDS_FIX_ROUND")][string]$DetectedState)
[pscustomobject]@{ configPath = $ConfigPath; taskId = $TaskId; detectedState = $DetectedState } | ConvertTo-Json -Compress | Set-Content -LiteralPath $env:WATCHER_TEST_RUNNER_CAPTURE -Encoding UTF8
exit 0
'@ | Set-Content -LiteralPath (Join-Path $runnerTestDirectory "run-controller.ps1") -Encoding UTF8
  $env:WATCHER_TEST_RUNNER_CAPTURE = $runnerCapture
  $originalScriptDirectory = $scriptDirectory
  $scriptDirectory = $runnerTestDirectory
  $runnerContext = Get-FixtureContext "DeliveryNewer"
  $runnerDecision = Get-WatcherDecision $runnerContext
  $runnerExit = Invoke-ControllerProcess $config $runnerContext $runnerDecision
  Assert-That ($runnerExit -eq 0) "Watcher runner invocation exited $runnerExit."
  $runnerCaptureValue = Get-Content -LiteralPath $runnerCapture -Raw | ConvertFrom-Json
  Assert-That ($runnerCaptureValue.taskId -eq "T-FIXTURE") "Watcher runner did not bind TaskId by name."
  Assert-That ($runnerCaptureValue.detectedState -eq "NEEDS_FAST_REVIEW") "Watcher runner did not bind DetectedState by name."
} finally {
  $scriptDirectory = $originalScriptDirectory
  Remove-Item Env:WATCHER_TEST_RUNNER_CAPTURE -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $runnerTestDirectory) { Remove-Item -LiteralPath $runnerTestDirectory -Recurse -Force }
}

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
  $json = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $watcher -ConfigPath $fixtureConfigPath -DryRun -Fixture $case.Name -AsJson
  Assert-That ($LASTEXITCODE -eq 0) "Fixture '$($case.Name)' exited $LASTEXITCODE."
  $actual = $json | ConvertFrom-Json
  Assert-That ($actual.detectedState -eq $case.State) "Fixture '$($case.Name)' state '$($actual.detectedState)' expected '$($case.State)'."
  Assert-That ($actual.action -eq $case.Action) "Fixture '$($case.Name)' action '$($actual.action)' expected '$($case.Action)'."
  Assert-That ([bool]$actual.codexInvoked -eq $case.Codex) "Fixture '$($case.Name)' Codex invocation plan mismatched."
  $results += $actual
}

$statusOnlyJson = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $watcher -ConfigPath $fixtureConfigPath -DryRun -Fixture "DeliveryNewer" -StatusOnly -AsJson
Assert-That ($LASTEXITCODE -eq 0) "Status-only watcher exited $LASTEXITCODE."
$statusOnlyResult = $statusOnlyJson | ConvertFrom-Json
Assert-That ($statusOnlyResult.action -eq "STATUS_ONLY") "Status-only watcher action is incorrect."
Assert-That ($statusOnlyResult.codexInvoked -eq $false) "Status-only watcher must never invoke Codex."

$runnerJson = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -ConfigPath $configForTests -TaskId "T-FIXTURE" -DetectedState "NEEDS_FAST_REVIEW" -DryRun
Assert-That ($LASTEXITCODE -eq 0) "Runner dry run exited $LASTEXITCODE."
$runnerResult = $runnerJson | ConvertFrom-Json
Assert-That ($runnerResult.model -eq $config.codex.controllerModel) "Runner changed the configured controller model."
Assert-That ($runnerResult.stdin -eq "explicit EOF") "Runner does not declare explicit stdin EOF."
Assert-That ($runnerResult.sandbox -eq "workspace-write") "Runner sandbox changed."

$invalidConfigPath = Join-Path ([System.IO.Path]::GetTempPath()) ("search-growth-watcher-invalid-cli-" + [guid]::NewGuid().ToString("N") + ".json")
try {
  $invalidConfig = ($config | ConvertTo-Json -Depth 8 | ConvertFrom-Json)
  $invalidConfig.codex.useApproveForMe = $true
  $invalidConfig | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $invalidConfigPath -Encoding UTF8
  $null = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -ConfigPath $invalidConfigPath -TaskId "T-FIXTURE" -DetectedState "NEEDS_FAST_REVIEW" -DryRun 2>&1
  Assert-That ($LASTEXITCODE -ne 0) "Invalid sandbox/approve CLI configuration was not rejected by dry run."
} finally {
  Remove-Item -LiteralPath $invalidConfigPath -Force -ErrorAction SilentlyContinue
}

$failureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("search-growth-watcher-failure-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Force -Path $failureRoot | Out-Null
  $failureConfig = ($config | ConvertTo-Json -Depth 8 | ConvertFrom-Json)
  $failureConfig.repositoryRoot = $failureRoot
  $failureContext = Get-FixtureContext "DeliveryNewer"
  $failureDecision = Get-WatcherDecision $failureContext
  $failureFingerprint = Get-DecisionFingerprint $failureContext $failureDecision
  Write-WatcherState $failureConfig ([pscustomobject]@{ lastInvocationFingerprint = $failureFingerprint; lastControllerExitCode = 2; lastState = "NEEDS_FAST_REVIEW"; updatedAt = "fixture" })
  $suppressed = Invoke-ControllerWatcher $failureConfig $failureContext
  Assert-That ($suppressed.detectedState -eq "HUMAN_GATE_ON_CONTROLLER_FAILURE") "Failed Controller state was not promoted to a Human Gate."
  Assert-That ($suppressed.action -eq "SUPPRESS_CONTROLLER_FAILURE") "Failed Controller state was not suppressed."
  Assert-That ($suppressed.codexInvoked -eq $false) "Repeated failed Controller fingerprint invoked Codex."
  $reset = Reset-FailedControllerInvocation $failureConfig
  Assert-That ($reset.reset -eq $true) "Explicit failed Controller reset did not clear the fingerprint."
  $afterReset = Get-WatcherDecision $failureContext
  Assert-That ($afterReset.InvokeCodex -eq $true) "Explicit reset did not permit one new Controller invocation."
} finally {
  if (Test-Path -LiteralPath $failureRoot) { Remove-Item -LiteralPath $failureRoot -Recurse -Force }
}

$statusJson = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $statusScript -ConfigPath $configForTests -AsJson
Assert-That ($LASTEXITCODE -eq 0) "Status command exited $LASTEXITCODE."
$statusResult = $statusJson | ConvertFrom-Json
Assert-That ($null -ne $statusResult.watcherStatus) "Status command did not return WATCHER_STATUS."
Assert-That ($statusResult.schedule -eq "every $($config.scheduler.intervalMinutes) minutes") "Status command schedule is incorrect."

$statusDefaultJson = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $statusScript -AsJson
Assert-That ($LASTEXITCODE -eq 0) "Default status command exited $LASTEXITCODE."
$statusDefaultResult = $statusDefaultJson | ConvertFrom-Json
Assert-That ($null -ne $statusDefaultResult.watcherStatus) "Default status command did not resolve its config path."

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("search-growth-watcher-status-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
  $temporaryConfig = ($config | ConvertTo-Json -Depth 8 | ConvertFrom-Json)
  $temporaryConfig.repositoryRoot = $temporaryRoot
  $temporaryConfigPath = Join-Path $temporaryRoot "watcher.config.json"
  $temporaryConfig | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporaryConfigPath -Encoding UTF8
  $fixtureContext = Get-FixtureContext "DeliveryNewer"
  $fixtureDecision = Get-WatcherDecision $fixtureContext
  Write-WatcherStatus $temporaryConfig $fixtureContext $fixtureDecision "TEST_STATUS_WRITE" 0
  $writtenStatus = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $statusScript -ConfigPath $temporaryConfigPath -AsJson
  Assert-That ($LASTEXITCODE -eq 0) "Status command on a written runtime state exited $LASTEXITCODE."
  $written = $writtenStatus | ConvertFrom-Json
  Assert-That ($written.currentTask -eq "T-FIXTURE") "Written status current task is incorrect."
  Assert-That ($written.lastControllerAction -eq "TEST_STATUS_WRITE") "Written status action is incorrect."
  Assert-That ($written.humanActionRequired -eq $false) "Normal status unexpectedly requires human action."
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}

[pscustomobject]@{
  status = "PASS"
  fixtureCount = $fixtureCases.Count
  codexInvocationPlans = @($results | Where-Object { $_.codexInvoked }).Count
  zeroModelFixtures = @($results | Where-Object { -not $_.codexInvoked }).Count
  noStateChangeCodexInvocations = @($results | Where-Object { $_.detectedState -in @("CLAUDE_RUNNING", "NO_ACTION", "HUMAN_GATE") -and $_.codexInvoked }).Count
  runner = $runnerResult
  watcherStatus = $statusResult.watcherStatus
} | ConvertTo-Json -Compress

Remove-Item -LiteralPath $fixtureConfigPath -Force -ErrorAction SilentlyContinue
