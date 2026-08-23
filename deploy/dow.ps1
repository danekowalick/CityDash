$ProgressPreference = 'SilentlyContinue'
$bin = 'C:\apps\city-dash\.localdb\pgsql\bin'
$env:PGPASSWORD='citydash'
$q = @"
SELECT to_char(log_date,'Dy') AS dow, COUNT(*) AS logs, MIN(log_date) AS first, MAX(log_date) AS last
FROM press_logs GROUP BY 1, EXTRACT(DOW FROM log_date) ORDER BY EXTRACT(DOW FROM log_date);
"@
& "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d citydash -c $q
$q2 = "SELECT log_date, to_char(log_date,'Dy') AS dow FROM press_logs ORDER BY log_date DESC LIMIT 12;"
& "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d citydash -c $q2
