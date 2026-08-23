$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$app = 'C:\apps\city-dash'

$ingest = @'
Set-Location 'C:\apps\city-dash'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$stamp] ingest starting" *>> 'C:\apps\city-dash\ingest.log'
& npx tsx src/ingest/run.ts police-press-logs --limit 40 *>> 'C:\apps\city-dash\ingest.log'
& npx tsx src/ingest/run.ts civicclerk-meetings --days 400  *>> 'C:\apps\city-dash\ingest.log'
& npx tsx src/ingest/run.ts meeting-minutes --limit 60      *>> 'C:\apps\city-dash\ingest.log'
& npx tsx src/ingest/run.ts city-news                       *>> 'C:\apps\city-dash\ingest.log'
& npx tsx src/ingest/run.ts city-code                       *>> 'C:\apps\city-dash\ingest.log'
& npx tsx src/ingest/run.ts latah-gis                       *>> 'C:\apps\city-dash\ingest.log'
"[$stamp] ingest finished" *>> 'C:\apps\city-dash\ingest.log'
'@
Set-Content -Path "$app\run-ingest.ps1" -Value $ingest -Encoding ascii

$name = 'CityDashIngest'
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\apps\city-dash\run-ingest.ps1"'
# Just after midnight Pacific, once the previous day's press log is posted.
$trigger   = New-ScheduledTaskTrigger -Daily -At 00:30
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 4) -StartWhenAvailable
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Write-Output "ingest task registered (daily 00:30)"

Start-ScheduledTask -TaskName $name
Write-Output "initial ingest started in background"
Get-ScheduledTask -TaskName CityDash,CityDashIngest | Select-Object TaskName,State | Format-Table -AutoSize | Out-String
