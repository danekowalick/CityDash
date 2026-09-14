# The five-times-a-day pass: police logs and city announcements only.
#
# Same contract as run-ingest.ps1 -- ensure the database, check every exit
# code, and let Task Scheduler see a non-zero result when something broke.

Set-Location 'C:\apps\city-dash'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$log = 'C:\apps\city-dash\ingest.log'
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$stamp] quick ingest" *>> $log

& powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\apps\city-dash\ensure-db.ps1' *>> $log
if ($LASTEXITCODE -ne 0) {
    "[$stamp] ABORT: database unavailable" *>> $log
    exit 1
}

$failed = @()

& npx tsx src/ingest/run.ts police-press-logs --limit 12 *>> $log
if ($LASTEXITCODE -ne 0) { $failed += 'police-press-logs' }

& npx tsx src/ingest/run.ts city-news *>> $log
if ($LASTEXITCODE -ne 0) { $failed += 'city-news' }

if ($failed.Count -gt 0) {
    "[$stamp] quick ingest failed: $($failed -join ', ')" *>> $log
    exit 1
}

exit 0
