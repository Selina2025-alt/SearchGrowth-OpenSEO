param(
  [Parameter(Mandatory=$true)][string]$TaskId,
  [int]$Round = 1
)
$ErrorActionPreference = "Stop"

function Resolve-ClaudeCommand {
  foreach($name in @("claude.cmd","claude.exe","claude")){
    $cmd=Get-Command $name -ErrorAction SilentlyContinue
    if($cmd){return $cmd}
  }
  throw "Claude Code CLI not found. Run probe-environment.ps1."
}

$root=(& git rev-parse --show-toplevel).Trim()
Set-Location $root
$config=Get-Content ".ai-orchestrator\config.json" -Raw | ConvertFrom-Json
if($Round -lt 1 -or $Round -gt [int]$config.maxExecutorRounds){throw "Round outside configured range"}

$claudeCmd=Resolve-ClaudeCommand
$worktree=& "$PSScriptRoot\create-task-worktree.ps1" -TaskId $TaskId | Select-Object -Last 1
$worktree=[string]$worktree

$taskPath=Join-Path $worktree "control\tasks\$TaskId\TASK.md"
if(-not(Test-Path $taskPath)){throw "Task missing in worktree: $taskPath"}

$reviewSource=Join-Path $root "control\tasks\$TaskId\REVIEW.md"
if($Round -gt 1 -and (Test-Path $reviewSource)){
  $reviewTargetDir=Join-Path $worktree "control\tasks\$TaskId"
  New-Item -ItemType Directory -Force -Path $reviewTargetDir|Out-Null
  Copy-Item $reviewSource (Join-Path $reviewTargetDir "REVIEW.md") -Force
}

$runDir=Join-Path $root "control\tasks\$TaskId\runs"
New-Item -ItemType Directory -Force -Path $runDir|Out-Null
$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$stdoutFile=Join-Path $runDir ("claude-round-{0}-{1}.stdout.json" -f $Round,$stamp)
$stderrFile=Join-Path $runDir ("claude-round-{0}-{1}.stderr.log" -f $Round,$stamp)

$instruction=@"
You are the Implementation Engineer for Search Growth V1.0.
Read root CLAUDE.md and control/tasks/$TaskId/TASK.md.
This is implementation round $Round.
If REVIEW.md exists, address its findings.
Implement only this task, run required tests, write control/tasks/$TaskId/DELIVERY.md, and stop.
Do not merge, do not edit REVIEW.md, do not begin another task, and do not run production publishing.
"@

Push-Location $worktree
try{
  $args=@("-p",$instruction,"--output-format",[string]$config.claude.outputFormat,"--max-turns",[string]$config.claude.maxTurns)
  foreach($extra in $config.claude.extraArgs){$args += [string]$extra}

  # Keep stdout/stderr separate. Custom DeepSeek routing can emit non-fatal
  # model/session-title warnings on stderr that would corrupt JSON if merged.
  & $claudeCmd.Source @args 1>$stdoutFile 2>$stderrFile
  $exitCode=$LASTEXITCODE
  if($exitCode -ne 0){throw "Claude executor exited with code $exitCode. See $stderrFile"}
}finally{
  Pop-Location
}

$deliveryInWorktree=Join-Path $worktree "control\tasks\$TaskId\DELIVERY.md"
if(-not(Test-Path $deliveryInWorktree)){throw "Claude completed without DELIVERY.md. Inspect $stdoutFile and $stderrFile"}

$controllerTaskDir=Join-Path $root "control\tasks\$TaskId"
New-Item -ItemType Directory -Force -Path $controllerTaskDir|Out-Null
Copy-Item $deliveryInWorktree (Join-Path $controllerTaskDir "DELIVERY.md") -Force

Write-Host "Claude round $Round finished."
Write-Host "Command: $($claudeCmd.Source)"
Write-Host "Worktree: $worktree"
Write-Host "Delivery: $(Join-Path $controllerTaskDir 'DELIVERY.md')"
Write-Host "stdout: $stdoutFile"
Write-Host "stderr: $stderrFile"
