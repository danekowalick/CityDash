# Copy the committed deploy/ scripts over the runtime copies at the app root.
#
# Task Scheduler runs C:\apps\city-dash\*.ps1, but the versioned originals
# live in deploy/. Without this step the two drift, and the thing actually
# executing is whatever was last hand-copied rather than what is in git.

$ErrorActionPreference = 'Stop'

$root = 'C:\apps\city-dash'
$src  = Join-Path $root 'deploy'

$scripts = @(
    'ensure-db.ps1',
    'run-server.ps1',
    'run-ingest.ps1',
    'run-quick.ps1',
    'health.ps1',
    'register-db-service.ps1',
    'coldstart-test.ps1'
)

foreach ($s in $scripts) {
    $from = Join-Path $src $s
    $to   = Join-Path $root $s
    Copy-Item -Path $from -Destination $to -Force
    $h = (Get-FileHash -Path $to -Algorithm SHA256).Hash.Substring(0, 12)
    Write-Output ("  " + $s.PadRight(24) + $h)
}

Write-Output "runtime scripts synced from deploy/"
