$ProgressPreference = 'SilentlyContinue'
$ts = "C:\Program Files\Tailscale\tailscale.exe"
Write-Output "=== re-enabling funnel on 443 ==="
& $ts funnel --bg --https=443 on 2>&1 | Select-Object -Last 4
Start-Sleep -Seconds 3
Write-Output "=== STATUS ==="
& $ts serve status
$cfg = & $ts serve status --json | ConvertFrom-Json
Write-Output ("AllowFunnel 443 : " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:443')
Write-Output ("AllowFunnel 8443: " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:8443')
