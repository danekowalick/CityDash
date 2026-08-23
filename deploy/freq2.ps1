$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$name = 'CityDashQuick'
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\apps\city-dash\run-quick.ps1"'

# Explicit daily triggers across the working day. MPD posts during business
# hours, so a nightly-only run left a log published at 10am unseen until
# after midnight.
$triggers = @(
  (New-ScheduledTaskTrigger -Daily -At 07:00),
  (New-ScheduledTaskTrigger -Daily -At 10:00),
  (New-ScheduledTaskTrigger -Daily -At 13:00),
  (New-ScheduledTaskTrigger -Daily -At 16:00),
  (New-ScheduledTaskTrigger -Daily -At 19:00)
)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
             -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable
Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Principal $principal -Settings $settings | Out-Null
Write-Output "registered"
Start-ScheduledTask -TaskName $name
Start-Sleep -Seconds 5
$i = Get-ScheduledTaskInfo -TaskName $name
Write-Output ("state=" + (Get-ScheduledTask -TaskName $name).State + " next=" + $i.NextRunTime)
Get-ScheduledTask -TaskName CityDash,CityDashIngest,CityDashQuick | Select-Object TaskName,State | Format-Table -AutoSize | Out-String
