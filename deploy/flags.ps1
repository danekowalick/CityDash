$ProgressPreference = 'SilentlyContinue'
$ts = "C:\Program Files\Tailscale\tailscale.exe"
$h = & $ts serve --help 2>&1
$h | ForEach-Object { $s = "$_"; if ($s -notmatch 'RemoteException') { Write-Output ("  " + $s) } }
