$baseline = [ordered]@{
  generatedAt = (Get-Date).ToString("o")
  wechatsync = @{
    cliVersion = $null
    extensionVersion = $null
    platforms = @{}
  }
  yxer = @{
    version = $null
    doctor = $null
    platforms = @{}
  }
  socialAutoUpload = @{
    commit = $null
    platforms = @{}
  }
  postiz = @{
    version = $null
    targets = @{}
  }
}
$baseline | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 "CONNECTOR_BASELINE.json"
Write-Host "Fill only from real smoke results; never infer capabilities from README."
