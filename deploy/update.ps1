$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location 'C:\apps\city-dash'

& git fetch --all --quiet
& git reset --hard origin/main --quiet
Write-Output ("HEAD: " + (& git log --oneline -1))

$env:NODE_ENV = 'production'
& npx next build 2>&1 | Select-Object -Last 2

Stop-ScheduledTask -TaskName CityDash -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName CityDash
Start-Sleep -Seconds 14
try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3002/police" -TimeoutSec 30
      Write-Output ("police page: " + $r.StatusCode) } catch { Write-Output ("ERROR: " + $_.Exception.Message) }
