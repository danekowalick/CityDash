# Register the portable Postgres cluster as a Windows service: citydash-pg.
#
# Two earlier attempts ran the cluster from a Scheduled Task, and both broke
# the same way. Windows puts every process a task starts into that task's
# job object, and every process an SSH session starts into the session's.
# Stop the task, or close the session, and Postgres is killed with it. And
# because pg_ctl leaves postgres holding the caller's redirected output
# pipe, the script that started it never returned -- which is how the web
# server sat waiting behind it for nine hours on 2026-09-14.
#
# A service is owned by the Service Control Manager instead: nothing else's
# lifetime can end it, it starts at boot before any task, and starting it
# returns immediately. This is how pg_ctl is meant to run on Windows, and
# how the separate postgresql-17 install on this machine already runs.
#
# Safe to re-run.

$ErrorActionPreference = 'Stop'

$name = 'citydash-pg'
$db   = 'C:\apps\city-dash\.localdb'
$bin  = Join-Path $db 'pgsql\bin'
$data = Join-Path $db 'data'

# The old boot task is superseded. Remove it so two things never race to
# start the same cluster again.
if (Get-ScheduledTask -TaskName 'CityDashDb' -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName 'CityDashDb' -Confirm:$false
    Write-Output "removed scheduled task CityDashDb"
}

if (Get-Service -Name $name -ErrorAction SilentlyContinue) {
    Write-Output "service $name already registered"
} else {
    # NetworkService, not LocalSystem: the cluster needs nothing beyond its
    # own directory and a loopback port.
    & (Join-Path $bin 'pg_ctl.exe') register -N $name -U 'NT AUTHORITY\NetworkService' `
        -D $data -o '-p 55432 -h 127.0.0.1' -S auto -w
    if ($LASTEXITCODE -ne 0) { throw "pg_ctl register failed ($LASTEXITCODE)" }
    Write-Output "registered service $name"
}

# NetworkService must be able to write the data directory. (OI)(CI) so new
# WAL segments and relation files inherit it.
& icacls $data /grant 'NT AUTHORITY\NetworkService:(OI)(CI)F' /T /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls failed ($LASTEXITCODE)" }

# If it dies, bring it back: restart after 10s, three times, counter reset daily.
& sc.exe failure $name reset= 86400 actions= restart/10000/restart/10000/restart/10000 | Out-Null

Set-Service -Name $name -StartupType Automatic
Start-Service -Name $name
(Get-Service -Name $name) | ForEach-Object { Write-Output ("service " + $_.Name + " " + $_.Status + " " + $_.StartType) }
