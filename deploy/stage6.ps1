$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$name = 'CityDash'
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
}
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\apps\city-dash\run-server.ps1"'
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $name
Write-Output "task registered and started"

Start-Sleep -Seconds 12
foreach ($p in @('/citydash','/citydash/meetings','/citydash/calendar.ics')) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:3002" + $p) -TimeoutSec 25
    Write-Output ("  " + $p + " -> " + $r.StatusCode)
  } catch { Write-Output ("  " + $p + " -> ERROR " + $_.Exception.Message) }
}
Write-Output "=== neighbours untouched ==="
foreach ($pair in @(@('tourney',3000),@('kb',4000))) {
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:" + $pair[1] + "/") -TimeoutSec 15
        Write-Output ("  " + $pair[0] + " :" + $pair[1] + " -> " + $r.StatusCode) }
  catch { Write-Output ("  " + $pair[0] + " ERROR " + $_.Exception.Message) }
}
Write-Output "STAGE6_OK"
