$ProgressPreference = 'SilentlyContinue'
$ts = "C:\Program Files\Tailscale\tailscale.exe"
& $ts serve status
Write-Output "=== authoritative funnel flags ==="
$cfg = & $ts serve status --json | ConvertFrom-Json
Write-Output ("AllowFunnel 443 : " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:443')
Write-Output ("AllowFunnel 8443: " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:8443')
Write-Output ("443 /          -> " + $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/'.Proxy)
Write-Output ("443 /citydash  -> " + $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/citydash'.Proxy)
