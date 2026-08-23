$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$app = 'C:\apps\city-dash'
Set-Location $app

# Tailscale strips the mount prefix, so a sub-path cannot work with Next's
# basePath. Serving at the root of its own Funnel port instead.
$lines = @(
  'DATABASE_URL=postgresql://citydash:citydash@127.0.0.1:55432/citydash',
  'CITYDASH_USER_AGENT=CityDashBot/0.1 (+https://minion2.taile2f00a.ts.net:10000/; dkowalick@gmail.com)'
)
Set-Content -Path "$app\.env" -Value $lines -Encoding ascii

$runner = @'
Set-Location 'C:\apps\city-dash'
$env:NODE_ENV = 'production'
& 'C:\Program Files\nodejs\node.exe' node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3002 *>> 'C:\apps\city-dash\server.log'
'@
Set-Content -Path "$app\run-server.ps1" -Value $runner -Encoding ascii

Remove-Item Env:NEXT_PUBLIC_BASE_PATH -ErrorAction SilentlyContinue
$env:NODE_ENV = 'production'
Write-Output "=== rebuild without basePath ==="
& npx next build 2>&1 | Select-Object -Last 3
$m = Get-Content "$app\.next\routes-manifest.json" -Raw | ConvertFrom-Json
Write-Output ("basePath now: '" + $m.basePath + "'")

Stop-ScheduledTask -TaskName CityDash -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName CityDash
Start-Sleep -Seconds 12
try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3002/" -TimeoutSec 25
      Write-Output ("local root: " + $r.StatusCode) } catch { Write-Output ("local root ERROR: " + $_.Exception.Message) }
Write-Output "STAGE8_OK"
