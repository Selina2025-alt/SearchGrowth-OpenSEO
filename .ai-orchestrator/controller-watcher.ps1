[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot "controller-watcher.config.json"),
  [switch]$DryRun,
  [ValidateSet("ClaudeRunning", "DeliveryNewer", "DeliveryAlreadyHandled", "ReviewNewer", "NoDelivery429", "NoDeliveryMaxTurns", "BlockedRound1", "BlockedRound3", "HumanGate", "StaleGitLock")]
  [string]$Fixture,
  [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ControllerWatcherConfig {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { throw "Watcher config does not exist: $Path" }
  $config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  foreach ($name in @("repositoryRoot", "integrationBranch", "scheduler", "watcher", "codex", "safety")) {
    if ($null -eq $config.$name) { throw "Watcher config is missing '$name'." }
  }
  if ([string]::IsNullOrWhiteSpace($config.codex.executablePath)) { throw "Watcher config is missing codex.executablePath." }
  if ([string]::IsNullOrWhiteSpace($config.watcher.runtimeDirectory)) { throw "Watcher config is missing watcher.runtimeDirectory." }
  if ($config.codex.controllerModel -match "(?i)sol") { throw "Watcher config must not default to a Sol model." }
  if ($config.codex.allowModelFallback -ne $false) { throw "Watcher config must disable automatic model fallback." }
  return $config
}

function Resolve-RepositoryPath {
  param([object]$Config, [string]$RelativePath)
  if ([System.IO.Path]::IsPathRooted($RelativePath)) { return $RelativePath }
  return Join-Path $Config.repositoryRoot $RelativePath
}

function Get-ProjectStateValue {
  param([string]$ProjectState, [string]$Name)
  $escapedName = [regex]::Escape($Name)
  $match = [regex]::Match($ProjectState, "(?m)^${escapedName}: (?<value>.+)$")
  if (-not $match.Success) { return $null }
  return $match.Groups["value"].Value.Trim()
}

function Get-RoundNumber {
  param([string]$RoundText)
  if ([string]::IsNullOrWhiteSpace($RoundText)) { return 0 }
  $match = [regex]::Match($RoundText, "(?<round>\d+)\s*/\s*\d+")
  if (-not $match.Success) { return 0 }
  return [int]$match.Groups["round"].Value
}

function Test-ActiveHumanGate {
  param([string]$RepositoryRoot)
  $path = Join-Path $RepositoryRoot "control\USER_ACTION_REQUIRED.md"
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  $content = Get-Content -LiteralPath $path -Raw
  if ($content -match "NO_ACTIVE_HUMAN_GATE") { return $false }
  return $content -match "(?im)^\s*REQUEST TYPE:\s*(HUMAN GATE|MODEL ESCALATION|CREDENTIAL|PRODUCTION|SCOPE|ADR|DESTRUCTIVE)"
}

function Get-GitLockState {
  param([string]$RepositoryRoot)
  $lockPath = (& git -C $RepositoryRoot rev-parse --git-path index.lock 2>$null).Trim()
  if ([string]::IsNullOrWhiteSpace($lockPath)) { return [pscustomobject]@{ Exists = $false; Active = $false; Path = $null } }
  if (-not [System.IO.Path]::IsPathRooted($lockPath)) { $lockPath = Join-Path $RepositoryRoot $lockPath }
  if (-not (Test-Path -LiteralPath $lockPath)) { return [pscustomobject]@{ Exists = $false; Active = $false; Path = $lockPath } }
  $active = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match "^git(\.exe)?$" -or ($_.CommandLine -match "(?i)\bgit(\.exe)?\b")
  }).Count -gt 0
  return [pscustomobject]@{ Exists = $true; Active = $active; Path = $lockPath }
}

function Get-ExecutorRunning {
  param([string]$TaskId)
  if ([string]::IsNullOrWhiteSpace($TaskId)) { return $false }
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "claude.exe" -and $_.CommandLine -match [regex]::Escape($TaskId)
  }).Count -gt 0
}

function Get-ExecutorInterruption {
  param([string]$TaskDirectory)
  $runs = Join-Path $TaskDirectory "runs"
  if (-not (Test-Path -LiteralPath $runs)) { return $null }
  $latest = Get-ChildItem -LiteralPath $runs -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "^claude-round-.*\.(stdout\.json|stderr\.log)$" } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if ($null -eq $latest) { return $null }
  $text = Get-Content -LiteralPath $latest.FullName -Raw -ErrorAction SilentlyContinue
  $patterns = @("api_error_status\s*[:=]\s*429", "rate limit exceeded", "error_max_turns", "maximum number of turns", "executor crash", "executor exited unexpectedly")
  foreach ($pattern in $patterns) {
    if ($text -match $pattern) { return [pscustomobject]@{ Kind = "EXECUTOR_INTERRUPTION"; Evidence = $pattern; File = $latest.FullName; Ticks = $latest.LastWriteTimeUtc.Ticks } }
  }
  return $null
}

function Get-WatcherContext {
  param([object]$Config)
  $statePath = Join-Path $Config.repositoryRoot "control\PROJECT_STATE.md"
  if (-not (Test-Path -LiteralPath $statePath)) { throw "PROJECT_STATE.md is missing." }
  $state = Get-Content -LiteralPath $statePath -Raw
  $taskId = Get-ProjectStateValue $state "CURRENT TASK"
  $taskDirectory = Join-Path $Config.repositoryRoot ("control\tasks\{0}" -f $taskId)
  $delivery = Join-Path $taskDirectory "DELIVERY.md"
  $review = Join-Path $taskDirectory "REVIEW.md"
  $deliveryItem = if (Test-Path -LiteralPath $delivery) { Get-Item -LiteralPath $delivery } else { $null }
  $reviewItem = if (Test-Path -LiteralPath $review) { Get-Item -LiteralPath $review } else { $null }
  $reviewContent = if ($null -ne $reviewItem) { Get-Content -LiteralPath $review -Raw } else { "" }
  return [pscustomobject]@{
    TaskId = $taskId
    Round = Get-RoundNumber (Get-ProjectStateValue $state "CURRENT ROUND")
    ProjectState = $state
    ClaudeRunning = Get-ExecutorRunning $taskId
    DeliveryExists = $null -ne $deliveryItem
    DeliveryTicks = if ($null -ne $deliveryItem) { $deliveryItem.LastWriteTimeUtc.Ticks } else { 0 }
    ReviewExists = $null -ne $reviewItem
    ReviewTicks = if ($null -ne $reviewItem) { $reviewItem.LastWriteTimeUtc.Ticks } else { 0 }
    ReviewBlocked = $reviewContent -match "(?is)##\s+VERDICT\s+\*\*BLOCKED"
    HumanGate = Test-ActiveHumanGate $Config.repositoryRoot
    GitLock = Get-GitLockState $Config.repositoryRoot
    Interruption = Get-ExecutorInterruption $taskDirectory
    PriorHandled = $false
  }
}

function Get-FixtureContext {
  param([string]$Name)
  $base = [pscustomobject]@{
    TaskId = "T-FIXTURE"; Round = 1; ProjectState = "LATEST ACCEPTED COMMIT: fixture-pass"; ClaudeRunning = $false; DeliveryExists = $false; DeliveryTicks = 0; ReviewExists = $false; ReviewTicks = 0; ReviewBlocked = $false; HumanGate = $false; GitLock = [pscustomobject]@{ Exists = $false; Active = $false; Path = "fixture.lock" }; Interruption = $null; PriorHandled = $false
  }
  switch ($Name) {
    "ClaudeRunning" { $base.ClaudeRunning = $true }
    "DeliveryNewer" { $base.DeliveryExists = $true; $base.DeliveryTicks = 20; $base.ReviewExists = $true; $base.ReviewTicks = 10 }
    "DeliveryAlreadyHandled" { $base.DeliveryExists = $true; $base.DeliveryTicks = 20; $base.ReviewExists = $true; $base.ReviewTicks = 10; $base.PriorHandled = $true }
    "ReviewNewer" { $base.DeliveryExists = $true; $base.DeliveryTicks = 10; $base.ReviewExists = $true; $base.ReviewTicks = 20 }
    "NoDelivery429" { $base.Interruption = [pscustomobject]@{ Kind = "EXECUTOR_INTERRUPTION"; Evidence = "429"; File = "fixture"; Ticks = 21 } }
    "NoDeliveryMaxTurns" { $base.Interruption = [pscustomobject]@{ Kind = "EXECUTOR_INTERRUPTION"; Evidence = "max_turns"; File = "fixture"; Ticks = 22 } }
    "BlockedRound1" { $base.ReviewExists = $true; $base.ReviewBlocked = $true; $base.Round = 1 }
    "BlockedRound3" { $base.ReviewExists = $true; $base.ReviewBlocked = $true; $base.Round = 3 }
    "HumanGate" { $base.HumanGate = $true }
    "StaleGitLock" { $base.GitLock = [pscustomobject]@{ Exists = $true; Active = $false; Path = "fixture.lock" } }
    default { throw "Unknown fixture: $Name" }
  }
  return $base
}

function Get-WatcherDecision {
  param([object]$Context)
  if ($Context.HumanGate) { return [pscustomobject]@{ State = "HUMAN_GATE"; Action = "EXIT"; InvokeCodex = $false } }
  if ($Context.GitLock.Exists) {
    if ($Context.GitLock.Active) { return [pscustomobject]@{ State = "GIT_LOCK_ACTIVE"; Action = "EXIT"; InvokeCodex = $false } }
    return [pscustomobject]@{ State = "STALE_GIT_LOCK"; Action = "WRITE_HUMAN_GATE"; InvokeCodex = $false }
  }
  if ($Context.ClaudeRunning) { return [pscustomobject]@{ State = "CLAUDE_RUNNING"; Action = "EXIT"; InvokeCodex = $false } }
  if ($Context.DeliveryExists -and ((-not $Context.ReviewExists) -or ($Context.DeliveryTicks -gt $Context.ReviewTicks))) {
    if ($Context.PriorHandled) { return [pscustomobject]@{ State = "NEEDS_FAST_REVIEW"; Action = "SUPPRESS_ALREADY_HANDLED"; InvokeCodex = $false } }
    return [pscustomobject]@{ State = "NEEDS_FAST_REVIEW"; Action = "INVOKE_CONTROLLER"; InvokeCodex = (-not $Context.PriorHandled) }
  }
  if (-not $Context.DeliveryExists -and $null -ne $Context.Interruption) {
    return [pscustomobject]@{ State = "NEEDS_EXECUTOR_RECOVERY"; Action = "INVOKE_CONTROLLER"; InvokeCodex = $true }
  }
  if ($Context.ReviewBlocked) {
    if ($Context.Round -ge 3) { return [pscustomobject]@{ State = "ROUND_LIMIT_HUMAN_GATE"; Action = "WRITE_HUMAN_GATE"; InvokeCodex = $false } }
    return [pscustomobject]@{ State = "NEEDS_FIX_ROUND"; Action = "INVOKE_CONTROLLER"; InvokeCodex = $true }
  }
  return [pscustomobject]@{ State = "NO_ACTION"; Action = "EXIT"; InvokeCodex = $false }
}

function Get-DecisionFingerprint {
  param([object]$Context, [object]$Decision)
  $parts = @($Context.TaskId, $Context.Round, $Decision.State, $Context.DeliveryTicks, $Context.ReviewTicks)
  if ($null -ne $Context.Interruption) { $parts += $Context.Interruption.Ticks }
  return ($parts -join "|")
}

function Write-WatcherLog {
  param([object]$Config, [object]$Entry)
  $logDir = Resolve-RepositoryPath $Config $Config.watcher.logDirectory
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $path = Join-Path $logDir ("controller-watcher-{0}.jsonl" -f (Get-Date -Format "yyyyMMdd"))
  ($Entry | ConvertTo-Json -Compress -Depth 6) | Add-Content -LiteralPath $path -Encoding UTF8
}

function Get-StatusTimestamp {
  param([long]$Ticks)
  if ($Ticks -le 0) { return $null }
  return ([datetime]::new($Ticks, [System.DateTimeKind]::Utc)).ToString("o")
}

function Get-NextActionText {
  param([object]$Decision)
  switch ($Decision.Action) {
    "INVOKE_CONTROLLER" { return "Invoke the economy-tier Controller once for $($Decision.State)." }
    "SUPPRESS_ALREADY_HANDLED" { return "Await a newer Delivery, Review, or executor state." }
    "WRITE_HUMAN_GATE" { return "Await Product Owner action; automatic recovery is prohibited." }
    default { return "Await a state change; no model invocation is needed." }
  }
}

function Write-WatcherStatus {
  param(
    [object]$Config,
    [object]$Context,
    [object]$Decision,
    [string]$LastControllerAction,
    [int]$ControllerExitCode = 0,
    [string]$WatcherStatus = "ACTIVE",
    [string]$Failure = $null
  )
  $runtimeDirectory = Resolve-RepositoryPath $Config $Config.watcher.runtimeDirectory
  New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
  $acceptedCommit = if ($null -ne $Context.ProjectState) { Get-ProjectStateValue $Context.ProjectState "LATEST ACCEPTED COMMIT" } else { $null }
  $humanAction = [bool]$Context.HumanGate -or $Decision.Action -eq "WRITE_HUMAN_GATE" -or $WatcherStatus -eq "FAILED"
  $status = [ordered]@{
    watcherStatus = $WatcherStatus
    schedule = "every $($Config.scheduler.intervalMinutes) minutes"
    currentTask = $Context.TaskId
    currentRound = $Context.Round
    currentState = $Decision.State
    claudeRunning = [bool]$Context.ClaudeRunning
    lastWatcherCheck = (Get-Date).ToUniversalTime().ToString("o")
    lastDelivery = Get-StatusTimestamp $Context.DeliveryTicks
    lastReview = Get-StatusTimestamp $Context.ReviewTicks
    lastPassMergeCommit = $acceptedCommit
    lastControllerAction = $LastControllerAction
    controllerExitCode = $ControllerExitCode
    nextAction = Get-NextActionText $Decision
    humanActionRequired = $humanAction
    failure = $Failure
  }
  $jsonPath = Join-Path $runtimeDirectory "STATUS.json"
  $textPath = Join-Path $runtimeDirectory "STATUS.txt"
  $jsonTemp = "$jsonPath.tmp"
  $textTemp = "$textPath.tmp"
  $status | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonTemp -Encoding UTF8
  Move-Item -LiteralPath $jsonTemp -Destination $jsonPath -Force
  @(
    "WATCHER_STATUS: $($status.watcherStatus)",
    "SCHEDULE: $($status.schedule)",
    "CURRENT_TASK: $($status.currentTask)",
    "CURRENT_ROUND: $($status.currentRound)",
    "CURRENT_STATE: $($status.currentState)",
    "CLAUDE_RUNNING: $($status.claudeRunning)",
    "LAST_WATCHER_CHECK: $($status.lastWatcherCheck)",
    "LAST_DELIVERY: $($status.lastDelivery)",
    "LAST_REVIEW: $($status.lastReview)",
    "LAST_PASS_MERGE_COMMIT: $($status.lastPassMergeCommit)",
    "LAST_CONTROLLER_ACTION: $($status.lastControllerAction)",
    "NEXT_ACTION: $($status.nextAction)",
    "HUMAN_ACTION_REQUIRED: $($status.humanActionRequired)",
    "FAILURE: $($status.failure)"
  ) | Set-Content -LiteralPath $textTemp -Encoding UTF8
  Move-Item -LiteralPath $textTemp -Destination $textPath -Force
}

function Write-DeterministicHumanGate {
  param([object]$Config, [object]$Context, [object]$Decision)
  $path = Join-Path $Config.repositoryRoot "control\USER_ACTION_REQUIRED.md"
  $content = @"
# USER ACTION REQUIRED

## REQUEST TYPE: HUMAN GATE

CURRENT TASK: $($Context.TaskId)

WHY AUTOMATION STOPPED: Watcher detected `$($Decision.State)` and is prohibited from automatic recovery or destructive lock removal.

NEXT ACTION: Review the local state and resolve the condition manually. The watcher will remain inactive until this file is cleared or marked `NO_ACTIVE_HUMAN_GATE`.
"@
  Set-Content -LiteralPath $path -Value $content -NoNewline
}

function Read-WatcherState {
  param([object]$Config)
  $path = Resolve-RepositoryPath $Config $Config.watcher.stateFile
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try { return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json } catch { return $null }
}

function Write-WatcherState {
  param([object]$Config, [object]$State)
  $path = Resolve-RepositoryPath $Config $Config.watcher.stateFile
  $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $path -Encoding UTF8
}

function Invoke-ControllerProcess {
  param([object]$Config, [object]$Context, [object]$Decision)
  $runner = Join-Path $PSScriptRoot "run-controller.ps1"
  $arguments = @("-ConfigPath", (Join-Path $PSScriptRoot "controller-watcher.config.json"), "-TaskId", $Context.TaskId, "-DetectedState", $Decision.State)
  $exitCode = 1
  & $runner @arguments
  $exitCode = $LASTEXITCODE
  return $exitCode
}

function Invoke-ControllerWatcher {
  param([object]$Config, [object]$Context)
  $decision = Get-WatcherDecision $Context
  $fingerprint = Get-DecisionFingerprint $Context $decision
  $prior = Read-WatcherState $Config
  if ($null -ne $prior -and $prior.lastInvocationFingerprint -eq $fingerprint -and $prior.lastControllerExitCode -eq 0 -and $decision.InvokeCodex) {
    $decision = [pscustomobject]@{ State = $decision.State; Action = "SUPPRESS_ALREADY_HANDLED"; InvokeCodex = $false }
  }
  $exitCode = 0
  if ($decision.Action -eq "WRITE_HUMAN_GATE") {
    if (-not $DryRun) { Write-DeterministicHumanGate $Config $Context $decision }
  } elseif ($decision.InvokeCodex) {
    if (-not $DryRun) { $exitCode = Invoke-ControllerProcess $Config $Context $decision }
  }
  $result = [pscustomobject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    task = $Context.TaskId
    detectedState = $decision.State
    action = $decision.Action
    codexInvoked = [bool]$decision.InvokeCodex
    exitCode = $exitCode
    nextState = if ($exitCode -eq 0) { "AWAIT_STATE_CHANGE" } else { "HUMAN_GATE_ON_CONTROLLER_FAILURE" }
    fingerprint = $fingerprint
  }
  if (-not $DryRun) {
    if ($exitCode -ne 0 -and $decision.InvokeCodex) { Write-DeterministicHumanGate $Config $Context ([pscustomobject]@{ State = "CONTROLLER_EXECUTION_FAILED" }) }
    Write-WatcherState $Config ([pscustomobject]@{ lastInvocationFingerprint = $fingerprint; lastControllerExitCode = $exitCode; lastState = $decision.State; updatedAt = $result.timestamp })
    $lastAction = if ($decision.InvokeCodex) { "CONTROLLER_INVOKED:$($decision.State)" } else { $decision.Action }
    Write-WatcherStatus $Config $Context $decision $lastAction $exitCode
    Write-WatcherLog $Config $result
  }
  return $result
}

function Invoke-Main {
  $config = Get-ControllerWatcherConfig $ConfigPath
  if ($Fixture) { $context = Get-FixtureContext $Fixture } else { $context = Get-WatcherContext $config }
  if ($Fixture -eq "DeliveryAlreadyHandled") { $context.PriorHandled = $true }
  $result = Invoke-ControllerWatcher $config $context
  if ($AsJson) { $result | ConvertTo-Json -Compress } else { $result }
  if ($result.exitCode -ne 0) { exit $result.exitCode }
}

if ($MyInvocation.InvocationName -ne ".") {
  $config = $null
  $mutex = New-Object System.Threading.Mutex($false, (Get-ControllerWatcherConfig $ConfigPath).watcher.mutexName)
  $hasMutex = $false
  try {
    $hasMutex = $mutex.WaitOne(0)
    if (-not $hasMutex) {
      $result = [pscustomobject]@{ timestamp = (Get-Date).ToUniversalTime().ToString("o"); task = $null; detectedState = "WATCHER_ALREADY_RUNNING"; action = "EXIT"; codexInvoked = $false; exitCode = 0; nextState = "NO_ACTION" }
      if ($AsJson) { $result | ConvertTo-Json -Compress } else { $result }
      exit 0
    }
    $config = Get-ControllerWatcherConfig $ConfigPath
    $lockPath = Resolve-RepositoryPath $config $config.watcher.lockFile
    if (-not $DryRun) { [pscustomobject]@{ pid = $PID; startedAt = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json | Set-Content -LiteralPath $lockPath -Encoding UTF8 }
    Invoke-Main
  } catch {
    $failure = $_.Exception.Message
    try {
      if (-not $DryRun -and $null -ne $config) {
        $statePath = Join-Path $config.repositoryRoot "control\PROJECT_STATE.md"
        $state = if (Test-Path -LiteralPath $statePath) { Get-Content -LiteralPath $statePath -Raw } else { "" }
        $failureContext = [pscustomobject]@{
          TaskId = Get-ProjectStateValue $state "CURRENT TASK"; Round = Get-RoundNumber (Get-ProjectStateValue $state "CURRENT ROUND"); ProjectState = $state
          ClaudeRunning = $false; DeliveryTicks = 0; ReviewTicks = 0; HumanGate = $false
        }
        $failureDecision = [pscustomobject]@{ State = "WATCHER_FAILURE"; Action = "WRITE_HUMAN_GATE"; InvokeCodex = $false }
        Write-DeterministicHumanGate $config $failureContext $failureDecision
        Write-WatcherStatus $config $failureContext $failureDecision "WATCHER_FAILURE" 1 "FAILED" $failure
      }
    } catch {}
    [Console]::Error.WriteLine($failure)
    exit 1
  } finally {
    if ($hasMutex) {
      try { if (-not $DryRun -and $null -ne $config) { Remove-Item -LiteralPath (Resolve-RepositoryPath $config $config.watcher.lockFile) -Force -ErrorAction SilentlyContinue } } catch {}
      $mutex.ReleaseMutex() | Out-Null
    }
    $mutex.Dispose()
  }
}
