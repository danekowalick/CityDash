$ProgressPreference = 'SilentlyContinue'
$js = @'
require("http").createServer((req,res)=>{
  res.writeHead(200,{"content-type":"text/plain"});
  res.end("ECHO_PATH=" + req.url + "\n");
}).listen(3003,"127.0.0.1",()=>console.log("echo on 3003"));
'@
Set-Content -Path 'C:\apps\city-dash\echo-probe.js' -Value $js -Encoding ascii
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'C:\apps\city-dash\echo-probe.js' -WindowStyle Hidden
Start-Sleep -Seconds 3
try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3003/hello" -TimeoutSec 10; Write-Output ("local echo: " + $r.Content.Trim()) } catch { Write-Output ("echo failed: " + $_.Exception.Message) }

$ts = "C:\Program Files\Tailscale\tailscale.exe"
Write-Output "=== repoint ONLY /citydash to the echo server (funnel form, keeps funnel on) ==="
& $ts funnel --bg --set-path=/citydash http://127.0.0.1:3003 2>&1 | Select-Object -Last 3
Start-Sleep -Seconds 3
$cfg = & $ts serve status --json | ConvertFrom-Json
Write-Output ("AllowFunnel 443: " + $cfg.AllowFunnel.'minion2.taile2f00a.ts.net:443')
Write-Output ("root -> " + $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/'.Proxy)
Write-Output ("citydash -> " + $cfg.Web.'minion2.taile2f00a.ts.net:443'.Handlers.'/citydash'.Proxy)
