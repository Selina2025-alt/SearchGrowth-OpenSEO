param(
  [Parameter(Mandatory=$true)][string]$TaskId
)
$ErrorActionPreference = "Stop"

$root = (& git rev-parse --show-toplevel).Trim()
Set-Location $root
$config = Get-Content ".ai-orchestrator\config.json" -Raw | ConvertFrom-Json
$integration = [string]$config.integrationBranch
$branch = [string]$config.taskBranchPrefix + $TaskId
$worktree = Join-Path $root (([string]$config.worktreeRoot) + "\" + $TaskId)
$review = Join-Path $root "control\tasks\$TaskId\REVIEW.md"

if (-not (Test-Path $review)) { throw "REVIEW.md missing" }
$reviewText = Get-Content $review -Raw
if ($reviewText -notmatch '(?m)^VERDICT:\s*(PASS|PASS_WITH_NON_BLOCKERS)\s*$') {
  throw "Task is not PASS/PASS_WITH_NON_BLOCKERS"
}
if (-not (Test-Path $worktree)) { throw "Task worktree missing: $worktree" }

# Copy controller review into the task branch for permanent traceability.
$taskDirInWorktree = Join-Path $worktree "control\tasks\$TaskId"
New-Item -ItemType Directory -Force -Path $taskDirInWorktree | Out-Null
Copy-Item $review (Join-Path $taskDirInWorktree "REVIEW.md") -Force

git -C $worktree add -A
$pending = (& git -C $worktree status --porcelain | Out-String).Trim()
if ($pending) {
  git -C $worktree commit -m "ai-task($TaskId): accepted implementation"
}

# Use a dedicated integration worktree so the human/main checkout is untouched.
$integrationWorktree = Join-Path $root (([string]$config.worktreeRoot) + "\_integration")
if (-not (Test-Path $integrationWorktree)) {
  git show-ref --verify --quiet "refs/heads/$integration"
  if ($LASTEXITCODE -ne 0) { git branch $integration HEAD }
  git worktree add $integrationWorktree $integration
}

$dirtyIntegration = (& git -C $integrationWorktree status --porcelain | Out-String).Trim()
if ($dirtyIntegration) { throw "Integration worktree is dirty; controller must inspect before merge." }

git -C $integrationWorktree merge --no-ff $branch -m "merge $TaskId after controller PASS"
if ($LASTEXITCODE -ne 0) {
  throw "Merge conflict/failure. Do not resolve by discarding changes; review manually."
}

Write-Host "Accepted and merged $TaskId into $integration."
Write-Host "main was not modified."
