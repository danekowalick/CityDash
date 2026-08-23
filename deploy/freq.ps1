$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$app = 'C:\apps\city-dash'

# A light, frequent pass over just the fast-moving feeds. Unchanged pages are
# detected by content hash, so a no-op run costs a couple of requests.
$quick = @'
Set-Location 'C:\apps\city-dash'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$stamp] quick ingest" *>> 'C:\apps\city-dash\ingest.log'
& npx tsx src/ingest/run.ts police-press-logs --limit 12 *>> 'C:\apps\city-dash\ingest.log'
& npx tsx src/ingest/run.ts city-news                    *>> 'C:\apps\city-dash\ingest.log'
'@
Set-Content -Path "$app\run-quick.ps1" -Value $quick -Encoding ascii

$name = 'CityDashQuick'
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\apps\city-dash\run-quick.ps1"'
# Every 3 hours. MPD posts during business hours; a nightly-only run meant a
# log published at 10am was not picked up until after midnight.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours(6) `
  -RepetitionInterval (New-TimeSpan -Hours 3) -RepetitionDuration ([TimeSpan]::MaxValue)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Write-Output "quick task registered (every 3h)"
Start-ScheduledTask -TaskName $name
Get-ScheduledTask -TaskName CityDash,CityDashIngest,CityDashQuick | Select-Object TaskName,State | Format-Table -AutoSize | Out-String
