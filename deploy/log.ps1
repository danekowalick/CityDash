$ProgressPreference = 'SilentlyContinue'
$log = 'C:\apps\city-dash\server.log'
Write-Output ("log exists: " + (Test-Path $log))
if (Test-Path $log) {
  Write-Output ("size: " + (Get-Item $log).Length + " bytes")
  Get-Content $log -Tail 25 | ForEach-Object { Write-Output ("  " + $_) }
}
