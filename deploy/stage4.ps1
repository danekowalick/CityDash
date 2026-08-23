$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location 'C:\apps\city-dash'

Write-Output "=== migrate ==="
& npm run db:migrate 2>&1 | Select-Object -Last 6

Write-Output "=== ingest: meetings (2 years) ==="
& npx tsx src/ingest/run.ts civicclerk-meetings --days 730 2>&1 | Select-Object -Last 3

Write-Output "=== ingest: police logs ==="
& npx tsx src/ingest/run.ts police-press-logs --limit 40 2>&1 | Select-Object -Last 2

Write-Output "=== ingest: city news ==="
& npx tsx src/ingest/run.ts city-news 2>&1 | Select-Object -Last 3

Write-Output "=== ingest: zoning + land use ==="
& npx tsx src/ingest/run.ts latah-gis 2>&1 | Select-Object -Last 3

Write-Output "STAGE4_OK"
