$ProgressPreference = 'SilentlyContinue'
Get-ScheduledTask -TaskName CityDash,CityDashIngest,CityDashQuick -ErrorAction SilentlyContinue |
  Select-Object TaskName,State | Format-Table -AutoSize | Out-String
$i = Get-ScheduledTaskInfo -TaskName CityDashQuick -ErrorAction SilentlyContinue
if ($i) { Write-Output ("quick last=" + $i.LastRunTime + " result=" + $i.LastTaskResult + " next=" + $i.NextRunTime) }
else { Write-Output "CityDashQuick NOT registered" }
