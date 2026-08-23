$ProgressPreference = 'SilentlyContinue'
$bin = 'C:\apps\city-dash\.localdb\pgsql\bin'
$env:PGPASSWORD='citydash'
$t = Get-ScheduledTask -TaskName CityDashBackfill -ErrorAction SilentlyContinue
Write-Output ("task state: " + $(if ($t) { $t.State } else { "gone" }))
$q = "SELECT 'meetings='||(SELECT COUNT(*) FROM meetings)||' minutes='||(SELECT COUNT(*) FROM meeting_minutes)||' motions='||(SELECT COUNT(*) FROM motions)||' agenda='||(SELECT COUNT(*) FROM agenda_items)||' coderefs='||(SELECT COUNT(*) FROM meeting_code_references);"
& "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d citydash -tA -c $q
if (Test-Path 'C:\apps\city-dash\backfill.log') {
  Get-Content 'C:\apps\city-dash\backfill.log' -Tail 4 | ForEach-Object { Write-Output ("  " + $_) }
}
