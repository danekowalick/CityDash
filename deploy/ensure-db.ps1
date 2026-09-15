# Make sure the Postgres cluster is accepting connections.
#
# The cluster runs as the Windows service citydash-pg. This script only ever
# asks the Service Control Manager to start it; it never launches postgres
# itself. Launching it from here is what went wrong twice: the process
# joined the caller's job object and died with it, and it inherited the
# caller's output pipe so this script never returned.
#
# Bounded: gives up after about a minute and exits 1. A caller must never be
# able to wait on the database forever.

$bin  = 'C:\apps\city-dash\.localdb\pgsql\bin'
$port = 55432
$name = 'citydash-pg'

function Test-Db {
    & (Join-Path $bin 'pg_isready.exe') -h 127.0.0.1 -p $port *> $null
    return $LASTEXITCODE -eq 0
}

if (Test-Db) {
    Write-Output "postgres already up on $port"
    exit 0
}

$svc = Get-Service -Name $name -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Output "service $name is not registered; run register-db-service.ps1"
    exit 1
}

if ($svc.Status -ne 'Running' -and $svc.Status -ne 'StartPending') {
    Write-Output "postgres not responding on $port; starting service $name"
    # Start-Service can block while the service reports StartPending; the
    # probe loop below is the real wait, so do not let this hang either.
    & sc.exe start $name | Out-Null
}

foreach ($attempt in 1..30) {
    if (Test-Db) {
        Write-Output "postgres up on $port after $attempt probe(s)"
        exit 0
    }
    Start-Sleep -Seconds 2
}

Write-Output "postgres did not come up on $port; see C:\apps\city-dash\.localdb\server.log and the service event log"
exit 1
