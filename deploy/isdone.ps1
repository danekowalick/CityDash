$t = Get-ScheduledTask -TaskName CityDashBackfill -ErrorAction SilentlyContinue
if ($t -and $t.State -eq 'Running') { Write-Output "RUNNING" } else { Write-Output "DONE" }
