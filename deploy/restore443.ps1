$ProgressPreference = 'SilentlyContinue'
$ts = "C:\Program Files\Tailscale\tailscale.exe"

Get-Process node -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -and (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $_.Id)).CommandLine -like '*echo-probe*'
} | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\apps\city-dash\echo-probe.js' -ErrorAction SilentlyContinue
Write-Output "echo probe cleaned up"

Write-Output "=== removing /citydash handler from 443 ==="
& $ts funnel --bg --set-path=/citydash off 2>&1 | Select-Object -Last 3
Start-Sleep -Seconds 3

$cfg = & $ts serve status --json | ConvertFrom-Json
$root = $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/'.Proxy
$cd   = $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/citydash'.Proxy
Write-Output ("AllowFunnel 443 : " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:443')
Write-Output ("AllowFunnel 8443: " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:8443')
Write-Output ("443 /         -> " + $root)
Write-Output ("443 /citydash -> " + $(if ($cd) { $cd } else { "(removed)" }))
Write-Output "=== STATUS ==="
& $ts serve status
