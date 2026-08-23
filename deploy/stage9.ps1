$ProgressPreference = 'SilentlyContinue'
$ts = "C:\Program Files\Tailscale\tailscale.exe"
Write-Output "=== funnel City Dash on port 10000 ==="
& $ts funnel --bg --https=10000 3002 2>&1 | Select-Object -Last 4
Start-Sleep -Seconds 4
$cfg = & $ts serve status --json | ConvertFrom-Json
Write-Output ("AllowFunnel 443  : " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:443')
Write-Output ("AllowFunnel 8443 : " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:8443')
Write-Output ("AllowFunnel 10000: " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:10000')
Write-Output ("443 /   -> " + $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/'.Proxy)
Write-Output ("8443 /  -> " + $cfg.Web.'minion2.taile2f00a.ts.net:8443'.Handlers.'/'.Proxy)
Write-Output ("10000 / -> " + $cfg.Web.'minion2.taile2f00a.ts.net:10000'.Handlers.'/'.Proxy)
Write-Output "=== STATUS ==="
& $ts serve status
