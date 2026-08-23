$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$ts = "C:\Program Files\Tailscale\tailscale.exe"

Write-Output "=== BEFORE ==="
& $ts serve status

# Additive: adds a /citydash handler on 443. Tailscale routes by longest
# prefix, so the existing "/" handler keeps serving the tourney app.
Write-Output "=== APPLYING ==="
& $ts serve --bg --set-path=/citydash http://127.0.0.1:3002 2>&1 | Select-Object -Last 5

Start-Sleep -Seconds 3
Write-Output "=== AFTER ==="
& $ts serve status

Write-Output "=== ROOT HANDLER INTACT? ==="
$cfg = & $ts serve status --json | ConvertFrom-Json
$root = $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/'.Proxy
$cd   = $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/citydash'.Proxy
$kb   = $cfg.Web.'minion2.taile2f00a.ts.net:8443'.Handlers.'/'.Proxy
Write-Output ("  443 /          -> " + $root)
Write-Output ("  443 /citydash  -> " + $cd)
Write-Output ("  8443 /         -> " + $kb)

if ($root -ne 'http://127.0.0.1:3000') {
  Write-Output "!! ROOT HANDLER CHANGED -- ROLLING BACK"
  & $ts serve --bg --set-path=/citydash off 2>&1 | Select-Object -Last 3
  Write-Output "ROLLED_BACK"
} else {
  Write-Output "ROOT_INTACT"
}
