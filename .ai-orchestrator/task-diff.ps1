param(
  [Parameter(Mandatory=$true)][string]$TaskId
)
$ErrorActionPreference = "Stop"
$root = (& git rev-parse --show-toplevel).Trim()
$config = Get-Content (Join-Path $root ".ai-orchestrator\config.json") -Raw | ConvertFrom-Json
$worktree = Join-Path $root (([string]$config.worktreeRoot) + "\" + $TaskId)

if (-not (Test-Path $worktree)) { throw "Worktree not found: $worktree" }

Write-Host "=== STATUS ==="
git -C $worktree status --short
Write-Host "=== DIFF STAT ==="
git -C $worktree diff --stat
Write-Host "=== DIFF ==="
git -C $worktree diff
