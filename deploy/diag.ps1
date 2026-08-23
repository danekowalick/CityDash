$ProgressPreference = 'SilentlyContinue'
$ts = "C:\Program Files\Tailscale\tailscale.exe"
Write-Output ("version: " + (& $ts version | Select-Object -First 1))
Write-Output "=== funnel help ==="
$h = & $ts funnel --help 2>&1
$h | Select-Object -First 30 | ForEach-Object { Write-Output ("  " + $_) }
