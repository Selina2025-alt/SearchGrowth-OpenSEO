param(
  [Parameter(Mandatory=$true)][string]$TaskId
)
$ErrorActionPreference = "Stop"
$root = (& git rev-parse --show-toplevel).Trim()
$config = Get-Content (Join-Path $root ".ai-orchestrator\config.json") -Raw | ConvertFrom-Json
$worktree = Join-Path $root (([string]$config.worktreeRoot) + "\" + $TaskId)

if (Test-Path $worktree) {
  $dirty = (& git -C $worktree status --porcelain | Out-String).Trim()
  if ($dirty) { throw "Worktree is dirty; do not remove until changes are reviewed/committed." }
  git worktree remove $worktree
}
git worktree prune
