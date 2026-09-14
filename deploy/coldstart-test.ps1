# Prove the boot path works: stop the cluster, then let CityDashDb restart it.
#
# This reproduces the 2026-09-08 failure deliberately. An untested recovery
# script is a guess, and the thing being fixed already cost six days of data.

$db  = 'C:\apps\city-dash\.localdb'
$bin = Join-Path $db 'pgsql\bin'
$isready = Join-Path $bin 'pg_isready.exe'
$pgctl   = Join-Path $bin 'pg_ctl.exe'

function Probe {
    & $isready -h 127.0.0.1 -p 55432 *> $null
    if ($LASTEXITCODE -eq 0) { return 'UP' } else { return 'DOWN' }
}

Write-Output ("before stop:  " + (Probe))

& $pgctl -D (Join-Path $db 'data') -m fast stop *> $null
Start-Sleep -Seconds 3
Write-Output ("after stop:   " + (Probe))

Start-ScheduledTask -TaskName CityDashDb
foreach ($i in 1..20) {
    Start-Sleep -Seconds 2
    if ((Probe) -eq 'UP') { break }
}

$info = Get-ScheduledTaskInfo -TaskName CityDashDb
Write-Output ("after task:   " + (Probe) + "   (task rc=" + $info.LastTaskResult + ")")
