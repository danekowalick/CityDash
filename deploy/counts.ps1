$ProgressPreference = 'SilentlyContinue'
$bin = 'C:\apps\city-dash\.localdb\pgsql\bin'
$env:PGPASSWORD='citydash'
$q = @"
SELECT 'incidents='||(SELECT COUNT(*) FROM incidents)
   ||' logs='||(SELECT COUNT(DISTINCT log_date) FROM press_logs)
   ||' meetings='||(SELECT COUNT(*) FROM meetings)
   ||' minutes='||(SELECT COUNT(*) FROM meeting_minutes WHERE NOT is_scanned)
   ||' scanned='||(SELECT COUNT(*) FROM meeting_minutes WHERE is_scanned)
   ||' motions='||(SELECT COUNT(*) FROM motions)
   ||' agenda='||(SELECT COUNT(*) FROM agenda_items)
   ||' chapters='||(SELECT COUNT(*) FROM code_chapters)
   ||' sections='||(SELECT COALESCE(SUM(section_count),0) FROM code_versions)
   ||' ordinances='||(SELECT COUNT(*) FROM ordinances)
   ||' coderefs='||(SELECT COUNT(*) FROM meeting_code_references)
   ||' zoning='||(SELECT COUNT(*) FROM zoning_districts)
   ||' landuse='||(SELECT COUNT(*) FROM land_use_actions)
   ||' news='||(SELECT COUNT(*) FROM city_news);
"@
& "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U citydash -d citydash -tA -c $q
