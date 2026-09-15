$ProgressPreference = 'SilentlyContinue'
$bin = 'C:\apps\city-dash\.localdb\pgsql\bin'
$env:PGPASSWORD='citydash'

# Check the database is reachable before anything else.
#
# This script once reported "recent failures: none" while the database had
# been down for six days -- the feeds could not record a failure because
# nothing could reach the table to write it to. An empty failure list is
# only good news if the database is answering.
& "$bin\pg_isready.exe" -h 127.0.0.1 -p 55432 *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Output "=== DATABASE DOWN ==="
    Write-Output "  Postgres is not accepting connections on 127.0.0.1:55432."
    Write-Output "  The site will be serving empty pages. Start it with:"
    Write-Output "    powershell -File C:\apps\city-dash\ensure-db.ps1"
    exit 1
}

# Check the site itself answers.
#
# On 2026-09-14 every line of this report looked healthy -- database up,
# feeds fresh, tasks "Running" -- while the public site returned 502,
# because the web server had never started. Feeds being fine says nothing
# about whether anyone can see them.
Write-Output "=== web ==="
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3002/sources' -UseBasicParsing -TimeoutSec 30
    if ($r.Content -match 'could not be read') {
        Write-Output "  3002 answers, but pages report the database could not be read  << DOWN"
    } else {
        Write-Output ("  3002 answers " + $r.StatusCode)
    }
} catch {
    Write-Output "  nothing answering on 127.0.0.1:3002  << DOWN (public site will 502)"
}
$svc = Get-Service -Name citydash-pg -ErrorAction SilentlyContinue
if ($svc) { Write-Output ("  citydash-pg service " + $svc.Status + " " + $svc.StartType) }
else      { Write-Output "  citydash-pg service MISSING" }

Write-Output "=== feed health ==="
$q = @"
SELECT rpad(s.id,22) || COALESCE(to_char(MAX(r.finished_at),'MM-DD HH24:MI'),'never')
    || CASE WHEN MAX(r.finished_at) < now() - interval '36 hours'
            THEN '  << STALE' ELSE '' END
  FROM sources s LEFT JOIN fetch_runs r ON r.source_id=s.id AND r.status='ok'
 WHERE s.enabled GROUP BY s.id ORDER BY s.id;
"@
& "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d citydash -tA -c $q

Write-Output "=== data ==="
$c = @"
SELECT 'incidents='||(SELECT COUNT(*) FROM incidents)
   ||' logs='||(SELECT COUNT(DISTINCT log_date) FROM press_logs)
   ||' latest_log='||(SELECT MAX(log_date) FROM press_logs)
   ||' meetings='||(SELECT COUNT(*) FROM meetings)
   ||' minutes='||(SELECT COUNT(*) FROM meeting_minutes WHERE NOT is_scanned)
   ||' motions='||(SELECT COUNT(*) FROM motions);
"@
& "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d citydash -tA -c $c

Write-Output "=== recent failures (last 3 days) ==="
$e = @"
SELECT rpad(source_id,22)||to_char(started_at,'MM-DD HH24:MI')||'  '||COALESCE(left(error,70),'')
  FROM fetch_runs WHERE status='error' AND started_at > now() - interval '3 days'
 ORDER BY started_at DESC LIMIT 6;
"@
$fail = & "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d citydash -tA -c $e
if ($fail) { $fail } else { Write-Output "  none" }

Write-Output "=== tasks ==="
foreach ($n in @('CityDash','CityDashIngest','CityDashQuick')) {
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  if ($t) { $i = Get-ScheduledTaskInfo -TaskName $n
    Write-Output ("  " + $n.PadRight(16) + $t.State.ToString().PadRight(9) + "last=" + $i.LastRunTime + " rc=" + $i.LastTaskResult) }
  else { Write-Output ("  " + $n + " MISSING") }
}

Write-Output "=== deployed commit ==="
Set-Location 'C:\apps\city-dash'
& git log --oneline -1
