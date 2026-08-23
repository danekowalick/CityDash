$ProgressPreference = 'SilentlyContinue'
$ts = "C:\Program Files\Tailscale\tailscale.exe"
Write-Output "=== restoring public funnel for the tourney root ==="
$out = & $ts funnel --bg 3000 2>&1
$out | ForEach-Object { Write-Output ("  " + $_) }
Start-Sleep -Seconds 3
$cfg = & $ts serve status --json | ConvertFrom-Json
Write-Output ("AllowFunnel 443 : " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:443')
Write-Output ("443 /          -> " + $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/'.Proxy)
Write-Output ("443 /citydash  -> " + $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/citydash'.Proxy)
Write-Output "=== STATUS ==="
& $ts serve status
