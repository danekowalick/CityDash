$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$app = 'C:\apps\city-dash'
$db  = "$app\.localdb"
$bin = "$db\pgsql\bin"

# Start on 55432 -- deliberately NOT 5432, which is already in use on this
# box and may back the tourney site. Nothing here touches that instance.
$ready = & "$bin\pg_isready.exe" -h 127.0.0.1 -p 55432 2>&1
if ($LASTEXITCODE -ne 0) {
  & "$bin\pg_ctl.exe" -D "$db\data" -l "$db\server.log" -o "-p 55432 -h 127.0.0.1" -w start 2>&1 | Select-Object -Last 2
  Start-Sleep -Seconds 3
}
Write-Output ("pg_isready: " + (& "$bin\pg_isready.exe" -h 127.0.0.1 -p 55432 2>&1))

$env:PGPASSWORD = 'citydash'
$exists = & "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='citydash'" 2>&1
if ("$exists".Trim() -ne "1") {
  & "$bin\createdb.exe" -h 127.0.0.1 -p 55432 -U citydash citydash 2>&1 | Select-Object -Last 2
  Write-Output "database created"
} else { Write-Output "database already present" }

# Confirm we did not disturb the pre-existing 5432 instance.
Write-Output ("existing 5432 still up: " + (& "$bin\pg_isready.exe" -h 127.0.0.1 -p 5432 2>&1))

@"
DATABASE_URL=postgresql://citydash:citydash@127.0.0.1:55432/citydash
NEXT_PUBLIC_BASE_PATH=/citydash
CITYDASH_USER_AGENT=CityDashBot/0.1 (+https://minion2.taile2f00a.ts.net/citydash; dkowalick@gmail.com)
"@ | Set-Content -Path "$app\.env" -Encoding ascii
Write-Output "wrote .env"
Write-Output "STAGE3_OK"
