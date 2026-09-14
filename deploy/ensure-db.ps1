# Bring the portable Postgres cluster up, if it is not already.
#
# The cluster is not a Windows service, so nothing restarted it when the
# machine rebooted on 2026-09-08. The web server came back on its own and
# served six days of empty pages against a database that was not there.
# Every entry point now calls this first, so the order of startup stops
# mattering.
#
# Idempotent by design: safe to call on every boot, before every ingest,
# and by hand.

$ErrorActionPreference = 'Stop'

$db  = 'C:\apps\city-dash\.localdb'
$bin = Join-Path $db 'pgsql\bin'
$port = 55432

function Test-Db {
    & (Join-Path $bin 'pg_isready.exe') -h 127.0.0.1 -p $port *> $null
    return $LASTEXITCODE -eq 0
}

if (Test-Db) {
    Write-Output "postgres already up on $port"
    exit 0
}

Write-Output "postgres not responding on $port; starting"

& (Join-Path $bin 'pg_ctl.exe') `
    -D (Join-Path $db 'data') `
    -l (Join-Path $db 'server.log') `
    -o "-p $port -h 127.0.0.1" `
    -w start *> $null

# pg_ctl -w returns once it believes the server is accepting connections,
# but on a cold boot the disk is busy and the first probe can still lose
# the race. Give it a bounded number of retries rather than trusting one.
foreach ($attempt in 1..15) {
    if (Test-Db) {
        Write-Output "postgres up on $port after $attempt probe(s)"
        exit 0
    }
    Start-Sleep -Seconds 2
}

Write-Error "postgres did not come up on $port; see $db\server.log"
exit 1
