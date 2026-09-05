param([Parameter(Mandatory=$true)][string]$TaskId)
$ErrorActionPreference="Stop"
$root=(& git rev-parse --show-toplevel).Trim()
$runDir=Join-Path $root "control\tasks\$TaskId\runs"
$round=2
if(Test-Path $runDir){
  $existing=Get-ChildItem $runDir -Filter "claude-round-*.stdout.json" -ErrorAction SilentlyContinue
  if($existing){
    $numbers=@()
    foreach($f in $existing){if($f.Name -match '^claude-round-(\d+)-'){$numbers += [int]$Matches[1]}}
    if($numbers.Count -gt 0){$round=(($numbers|Measure-Object -Maximum).Maximum+1)}
  }
}
& "$PSScriptRoot\dispatch-claude.ps1" -TaskId $TaskId -Round $round
