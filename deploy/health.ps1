$ProgressPreference = 'SilentlyContinue'
$bin = 'C:\apps\city-dash\.localdb\pgsql\bin'
$env:PGPASSWORD='citydash'
$q = @"
SELECT s.id || '  last_ok=' || COALESCE(MAX(r.finished_at)::text,'never')
  FROM sources s LEFT JOIN fetch_runs r ON r.source_id=s.id AND r.status='ok'
 WHERE s.enabled GROUP BY s.id ORDER BY s.id;
"@
& "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d citydash -tA -c $q
Write-Output "--- tasks ---"
foreach ($n in @('CityDash','CityDashIngest','CityDashQuick')) {
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  if ($t) { $i = Get-ScheduledTaskInfo -TaskName $n
    Write-Output ($n.PadRight(16) + $t.State.ToString().PadRight(9) + " last=" + $i.LastRunTime + " rc=" + $i.LastTaskResult) }
}
