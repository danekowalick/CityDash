$ProgressPreference = 'SilentlyContinue'
$bin = 'C:\apps\city-dash\.localdb\pgsql\bin'
Write-Output ("55432: " + (& "$bin\pg_isready.exe" -h 127.0.0.1 -p 55432 2>&1))
Write-Output ("5432 : " + (& "$bin\pg_isready.exe" -h 127.0.0.1 -p 5432 2>&1))
Write-Output ("env written: " + (Test-Path 'C:\apps\city-dash\.env'))
if (Test-Path 'C:\apps\city-dash\.env') { Get-Content 'C:\apps\city-dash\.env' | ForEach-Object { Write-Output ("  " + ($_ -replace 'citydash:citydash','***:***')) } }
Write-Output "=== tourney still fine? ==="
try { $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/" -TimeoutSec 10; Write-Output ("  tourney local: " + $r.StatusCode) } catch { Write-Output ("  tourney local ERROR: " + $_.Exception.Message) }
