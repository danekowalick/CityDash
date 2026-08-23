$ProgressPreference = 'SilentlyContinue'
function Probe($url) {
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 20
        $t = ([regex]::Match($r.Content,'<title>([^<]{0,60})')).Groups[1].Value
        Write-Output ("  " + $url + " -> " + $r.StatusCode + "  title=" + $t) }
  catch {
    $code = $_.Exception.Response.StatusCode.value__
    $body = ""
    try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $body = $sr.ReadToEnd() } catch {}
    $t = ([regex]::Match($body,'<title>([^<]{0,60})')).Groups[1].Value
    Write-Output ("  " + $url + " -> " + $code + "  title=" + $t)
  }
}
Write-Output "=== city dash app (3002) ==="
Probe "http://127.0.0.1:3002/citydash"
Probe "http://127.0.0.1:3002/"
Write-Output "=== tourney app (3000) ==="
Probe "http://127.0.0.1:3000/citydash"
Probe "http://127.0.0.1:3000/"
