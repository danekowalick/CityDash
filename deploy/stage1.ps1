$ErrorActionPreference = 'Stop'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$app = 'C:\apps\city-dash'

if (Test-Path $app) {
  Write-Output "EXISTS: $app -- pulling instead of cloning"
  Set-Location $app
  & git fetch --all --quiet
  & git reset --hard origin/main --quiet
} else {
  Write-Output "Cloning into $app"
  & git clone --quiet https://github.com/danekowalick/CityDash.git $app
  Set-Location $app
}
Write-Output ("HEAD: " + (& git log --oneline -1))

Write-Output "=== npm ci ==="
& npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 4
Write-Output ("node: " + (& node --version) + "  npm: " + (& npm --version))
Write-Output "STAGE1_OK"
