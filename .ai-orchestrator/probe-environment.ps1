param([int]$ModelProbeTimeoutSeconds = 90)
$ErrorActionPreference = "Continue"

function Resolve-Executable {
  param([string[]]$Names)
  foreach ($name in $Names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd }
  }
  return $null
}

function Run-Captured {
  param([string]$CommandPath,[string[]]$Args)
  $outFile=[System.IO.Path]::GetTempFileName()
  $errFile=[System.IO.Path]::GetTempFileName()
  try {
    & $CommandPath @Args 1>$outFile 2>$errFile
    $code=$LASTEXITCODE
    $stdout=(Get-Content $outFile -Raw -ErrorAction SilentlyContinue)
    $stderr=(Get-Content $errFile -Raw -ErrorAction SilentlyContinue)
    return @{exitCode=$code;stdout=$stdout;stderr=$stderr}
  } finally {
    Remove-Item $outFile,$errFile -Force -ErrorAction SilentlyContinue
  }
}

$repoRoot=$null
try {
  $repoRoot=(& git rev-parse --show-toplevel 2>$null | Out-String).Trim()
  if(-not $repoRoot){$repoRoot=$null}
} catch {}

$git=Resolve-Executable @("git.exe","git")
$codex=Resolve-Executable @("codex.exe","codex.cmd","codex")
# Windows PowerShell may block npm-generated claude.ps1; prefer claude.cmd.
$claude=Resolve-Executable @("claude.cmd","claude.exe","claude")
$code=Resolve-Executable @("code.cmd","code.exe","code")

$claudeVersion="NOT_FOUND"
$codexVersion="NOT_FOUND"
if($claude){
  $r=Run-Captured $claude.Source @("--version")
  $claudeVersion=(($r.stdout+"`n"+$r.stderr).Trim())
}
if($codex){
  $r=Run-Captured $codex.Source @("--version")
  $codexVersion=(($r.stdout+"`n"+$r.stderr).Trim())
}

$modelProbeOk=$false
$modelProbeStdout="NOT_RUN"
$modelProbeStderr=""
$observedModel=""
if($claude -and $repoRoot){
  $outFile=[System.IO.Path]::GetTempFileName()
  $errFile=[System.IO.Path]::GetTempFileName()
  $job=Start-Job -ScriptBlock {
    param($wd,$cmd,$out,$err)
    Set-Location $wd
    & $cmd -p "只回复 EXECUTOR_OK" --output-format text --max-turns 1 1>$out 2>$err
    exit $LASTEXITCODE
  } -ArgumentList $repoRoot,$claude.Source,$outFile,$errFile
  $finished=Wait-Job $job -Timeout $ModelProbeTimeoutSeconds
  if($finished){
    Receive-Job $job | Out-Null
    $modelProbeStdout=(Get-Content $outFile -Raw -ErrorAction SilentlyContinue).Trim()
    $modelProbeStderr=(Get-Content $errFile -Raw -ErrorAction SilentlyContinue).Trim()
    if($modelProbeStdout -match "(?m)^\s*EXECUTOR_OK\s*$"){$modelProbeOk=$true}
    $combined=$modelProbeStdout+"`n"+$modelProbeStderr
    if($combined -match '"model"\s*:\s*"([^"]+)"'){$observedModel=$Matches[1]}
  } else {
    Stop-Job $job -ErrorAction SilentlyContinue
    $modelProbeStdout="TIMEOUT"
  }
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  Remove-Item $outFile,$errFile -Force -ErrorAction SilentlyContinue
}

$ready=[bool]($repoRoot -and $claude -and $modelProbeOk)
$reportPath=if($repoRoot){Join-Path $repoRoot "control\AI_ENVIRONMENT_REPORT.md"}else{Join-Path (Get-Location) "control\AI_ENVIRONMENT_REPORT.md"}
New-Item -ItemType Directory -Force -Path (Split-Path $reportPath -Parent)|Out-Null

$lines=@(
"# AI ENVIRONMENT REPORT","",
"Generated: $((Get-Date).ToString('o'))","",
"DIRECT_CLAUDE_CLI_READY = "+($(if($ready){"YES"}else{"NO"})),"",
"## Repository",
"- Git root: "+($(if($repoRoot){$repoRoot}else{"NOT_FOUND"})),"",
"## Commands",
"- git: "+($(if($git){$git.Source}else{"NOT_FOUND"})),
"- codex: "+($(if($codex){$codex.Source}else{"NOT_FOUND"})),
"- codex version: $codexVersion",
"- claude: "+($(if($claude){$claude.Source}else{"NOT_FOUND"})),
"- claude version: $claudeVersion",
"- code: "+($(if($code){$code.Source}else{"NOT_FOUND"})),"",
"## Claude non-interactive probe",
"- stdout: "+($modelProbeStdout -replace "`r?`n"," | "),
"- stderr/warnings: "+($(if($modelProbeStderr){($modelProbeStderr -replace "`r?`n"," | ")}else{"NONE"})),
"- observed model: "+($(if($observedModel){$observedModel}else{"NOT_DETECTED"})),
"- passed: $modelProbeOk","",
"## Interpretation"
)
if($ready){
  $lines+="Direct Codex → Claude CLI orchestration is technically available."
  if($observedModel){$lines+="CLI output/warning contains model '$observedModel', indicating the custom model route is visible to the CLI."}
  $lines+="Non-fatal stderr warnings do not invalidate execution when stdout is correct and the process exits successfully."
}else{
  $lines+="Direct orchestration is not ready. Fix repo/CLI/backend probe before autonomous dispatch."
}
$lines+="";$lines+="No secret VALUES are recorded."

Set-Content -Path $reportPath -Value ($lines -join "`n") -Encoding UTF8
Write-Host "Report: $reportPath"
Write-Host "DIRECT_CLAUDE_CLI_READY = $($(if($ready){'YES'}else{'NO'}))"
if(-not $ready){exit 2}
