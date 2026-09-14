# Nightly ingest.
#
# Every step's exit code is now checked. The previous version piped each
# step to the log and ignored $LASTEXITCODE, so Task Scheduler recorded
# rc=0 through six days of total database failure. A job that cannot tell
# you it failed is worse than no job.

Set-Location 'C:\apps\city-dash'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$log = 'C:\apps\city-dash\ingest.log'
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$stamp] ingest starting" *>> $log

# Nothing below can work without the database, so fail loudly and early
# rather than logging the same connection error seven times.
& powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\apps\city-dash\ensure-db.ps1' *>> $log
if ($LASTEXITCODE -ne 0) {
    "[$stamp] ABORT: database unavailable" *>> $log
    exit 1
}

$failed = @()

function Invoke-Step {
    param([string]$Name, [string[]]$Args)
    & npx tsx src/ingest/run.ts @Args *>> $log
    if ($LASTEXITCODE -ne 0) { $script:failed += $Name }
}

Invoke-Step 'police-press-logs'   @('police-press-logs', '--limit', '40')
Invoke-Step 'civicclerk-meetings' @('civicclerk-meetings', '--days', '400')
Invoke-Step 'meeting-minutes'     @('meeting-minutes', '--limit', '60')
Invoke-Step 'agenda-packets'      @('agenda-packets', '--limit', '6', '--days', '60')
Invoke-Step 'city-news'           @('city-news')
Invoke-Step 'city-code'           @('city-code')
Invoke-Step 'latah-gis'           @('latah-gis')

$done = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if ($failed.Count -gt 0) {
    "[$done] ingest finished with failures: $($failed -join ', ')" *>> $log
    exit 1
}

"[$done] ingest finished" *>> $log
exit 0
