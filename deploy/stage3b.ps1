$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$app = 'C:\apps\city-dash'
$bin = "$app\.localdb\pgsql\bin"
$env:PGPASSWORD = 'citydash'

$exists = & "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='citydash'"
if ("$exists".Trim() -ne "1") {
  & "$bin\createdb.exe" -h 127.0.0.1 -p 55432 -U citydash citydash
  Write-Output "database created"
} else { Write-Output "database already present" }

$lines = @(
  'DATABASE_URL=postgresql://citydash:citydash@127.0.0.1:55432/citydash',
  'NEXT_PUBLIC_BASE_PATH=/citydash',
  'CITYDASH_USER_AGENT=CityDashBot/0.1 (+https://minion2.taile2f00a.ts.net/citydash; dkowalick@gmail.com)'
)
Set-Content -Path "$app\.env" -Value $lines -Encoding ascii
Write-Output ("env written: " + (Test-Path "$app\.env"))
Write-Output "STAGE3B_OK"
