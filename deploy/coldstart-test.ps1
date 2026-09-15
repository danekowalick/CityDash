# Reproduce both outages on purpose and prove the site recovers from each.
#
#   1. 2026-09-08: the database was down at boot and nothing started it.
#   2. 2026-09-14: the web server hung waiting on the database start, and
#      stopping the web task later killed Postgres along with it.
#
# Takes the site down for well under a minute. Does not touch any other app
# on this machine. The one thing this cannot simulate is a real reboot.

$bin = 'C:\apps\city-dash\.localdb\pgsql\bin'

function Db  { & (Join-Path $bin 'pg_isready.exe') -h 127.0.0.1 -p 55432 *> $null; if ($LASTEXITCODE -eq 0) { 'UP' } else { 'DOWN' } }
function Web { if (Get-NetTCPConnection -State Listen -LocalPort 3002 -ErrorAction SilentlyContinue) { 'UP' } else { 'DOWN' } }
function WaitFor([scriptblock]$check, [int]$seconds) {
    foreach ($i in 1..$seconds) { if ((& $check) -eq 'UP') { return "UP after ${i}s" }; Start-Sleep -Seconds 1 }
    return "DOWN after ${seconds}s"
}

$pass = $true

Write-Output "-- test 1: stopping the web task must not take the database with it"
Stop-ScheduledTask -TaskName CityDash
Start-Sleep -Seconds 3
$r = Db
Write-Output ("   db after web stop:        " + $r)
if ($r -ne 'UP') { $pass = $false }

Write-Output "-- test 2: web task starts with the database down (the boot race)"
Stop-Service -Name citydash-pg -Force
Start-Sleep -Seconds 2
Write-Output ("   db before start:          " + (Db))
Start-ScheduledTask -TaskName CityDash
$d = WaitFor { Db } 60
$w = WaitFor { Web } 90
Write-Output ("   db:                       " + $d)
Write-Output ("   web on 3002:              " + $w)
if ($d -notlike 'UP*' -or $w -notlike 'UP*') { $pass = $false }

# The hang left a child powershell running ensure-db.ps1 forever. Make sure
# nothing like that is left behind.
$stuck = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*ensure-db.ps1*' })
Write-Output ("   ensure-db still running:  " + $stuck.Count)
if ($stuck.Count -ne 0) { $pass = $false }

if ($pass) { Write-Output "PASS" } else { Write-Output "FAIL"; exit 1 }
