param(
  [Parameter(Mandatory=$true)][string]$TaskId
)
$ErrorActionPreference = "Stop"

if ($TaskId -notmatch '^[A-Za-z0-9._-]{1,64}$') {
  throw "Invalid TaskId"
}

$root = (& git rev-parse --show-toplevel).Trim()
Set-Location $root

$config = Get-Content ".ai-orchestrator\config.json" -Raw | ConvertFrom-Json
$integration = [string]$config.integrationBranch
$branch = [string]$config.taskBranchPrefix + $TaskId
$worktreeRoot = Join-Path $root ([string]$config.worktreeRoot)
$worktree = Join-Path $worktreeRoot $TaskId
$taskDir = Join-Path $root "control\tasks\$TaskId"
$taskFile = Join-Path $taskDir "TASK.md"

if (-not (Test-Path $taskFile)) {
  throw "TASK.md not found: $taskFile"
}

& "$PSScriptRoot\ensure-integration-branch.ps1" -IntegrationBranch $integration

New-Item -ItemType Directory -Force -Path $worktreeRoot | Out-Null

# A recovery task may intentionally continue an uncommitted executor worktree
# after its branch is renamed. Reuse the worktree already associated with the
# expected task branch even when its physical directory still has the prior
# task name (Windows can refuse a directory move while tool handles are open).
$associatedWorktree = $null
$listedWorktree = $null
foreach ($line in (& git worktree list --porcelain)) {
  if ($line -like "worktree *") {
    $listedWorktree = $line.Substring(9)
  } elseif ($line -eq "branch refs/heads/$branch" -and $listedWorktree) {
    $associatedWorktree = $listedWorktree
    break
  }
}
if ($associatedWorktree -and (Test-Path -LiteralPath $associatedWorktree)) {
  $targetTaskDir = Join-Path $associatedWorktree "control\tasks\$TaskId"
  New-Item -ItemType Directory -Force -Path $targetTaskDir | Out-Null
  Copy-Item $taskFile (Join-Path $targetTaskDir "TASK.md") -Force
  Copy-Item (Join-Path $root "CLAUDE.md") (Join-Path $associatedWorktree "CLAUDE.md") -Force
  Write-Host "Worktree already associated with task branch: $associatedWorktree"
  Write-Output $associatedWorktree
  exit 0
}

if (Test-Path $worktree) {
  Write-Host "Worktree already exists: $worktree"
  Write-Output $worktree
  exit 0
}

git show-ref --verify --quiet "refs/heads/$branch"
$branchExists = ($LASTEXITCODE -eq 0)

if ($branchExists) {
  git worktree add $worktree $branch
} else {
  git worktree add -b $branch $worktree $integration
}

# TASK.md may have been created after the integration branch snapshot.
$targetTaskDir = Join-Path $worktree "control\tasks\$TaskId"
New-Item -ItemType Directory -Force -Path $targetTaskDir | Out-Null
Copy-Item $taskFile (Join-Path $targetTaskDir "TASK.md") -Force

# Ensure the executor instructions are present even if orchestration files are not yet committed.
Copy-Item (Join-Path $root "CLAUDE.md") (Join-Path $worktree "CLAUDE.md") -Force

Write-Host "Task worktree: $worktree"
Write-Output $worktree
