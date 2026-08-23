$ProgressPreference = 'SilentlyContinue'
$bin = 'C:\apps\city-dash\.localdb\pgsql\bin'
$env:PGPASSWORD='citydash'
$q = @"
SELECT 'latest log: '||MAX(log_date)::text FROM press_logs
UNION ALL SELECT 'logs held: '||COUNT(DISTINCT log_date)::text FROM press_logs
UNION ALL SELECT 'incidents: '||COUNT(*)::text FROM incidents
UNION ALL SELECT 'last mpd run: '||COALESCE(MAX(finished_at)::text,'never') FROM fetch_runs WHERE source_id='mpd-press-logs' AND status='ok';
"@
& "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d citydash -tA -c $q
Write-Output "=== ingest task ==="
Get-ScheduledTask -TaskName CityDashIngest | Select-Object State | Format-Table -AutoSize | Out-String
Get-ScheduledTaskInfo -TaskName CityDashIngest | Select-Object LastRunTime,LastTaskResult,NextRunTime | Format-List | Out-String
Write-Output "=== ingest log tail ==="
if (Test-Path 'C:\apps\city-dash\ingest.log') { Get-Content 'C:\apps\city-dash\ingest.log' -Tail 12 | ForEach-Object { Write-Output ("  " + $_) } } else { Write-Output "  (no ingest.log)" }
