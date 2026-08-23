$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$app = 'C:\apps\city-dash'
Set-Location $app

$env:NEXT_PUBLIC_BASE_PATH = '/citydash'
$env:NODE_ENV = 'production'
Write-Output "=== build ==="
& npx next build 2>&1 | Select-Object -Last 4

$manifest = Get-Content "$app\.next\routes-manifest.json" -Raw | ConvertFrom-Json
Write-Output ("basePath baked in: " + $manifest.basePath)

# Matches the convention used by backyard-tourney and ebms-knowledge-base:
# a run-server.ps1 that a boot-triggered Scheduled Task launches.
$runner = @'
Set-Location 'C:\apps\city-dash'
$env:NODE_ENV = 'production'
$env:NEXT_PUBLIC_BASE_PATH = '/citydash'
& 'C:\Program Files\nodejs\node.exe' node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3002 *>> 'C:\apps\city-dash\server.log'
'@
Set-Content -Path "$app\run-server.ps1" -Value $runner -Encoding ascii
Write-Output "wrote run-server.ps1"
Write-Output "STAGE5_OK"
