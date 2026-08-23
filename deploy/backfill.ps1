$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$app = 'C:\apps\city-dash'

$script = @'
Set-Location 'C:\apps\city-dash'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$log = 'C:\apps\city-dash\backfill.log'
"[{0}] BACKFILL START" -f (Get-Date -Format "HH:mm:ss") *>> $log
& npx tsx src/ingest/run.ts civicclerk-meetings --days 2200 *>> $log
"[{0}] meetings done" -f (Get-Date -Format "HH:mm:ss") *>> $log
& npx tsx src/ingest/run.ts meeting-minutes --limit 420 *>> $log
"[{0}] minutes done" -f (Get-Date -Format "HH:mm:ss") *>> $log
& npx tsx src/ingest/run.ts police-press-logs --limit 120 *>> $log
"[{0}] BACKFILL COMPLETE" -f (Get-Date -Format "HH:mm:ss") *>> $log
'@
Set-Content -Path "$app\run-backfill.ps1" -Value $script -Encoding ascii
Remove-Item "$app\backfill.log" -ErrorAction SilentlyContinue

$name = 'CityDashBackfill'
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\apps\city-dash\run-backfill.ps1"'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 6) -StartWhenAvailable
Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $name
Write-Output "backfill task started"
