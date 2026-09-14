# Register CityDashDb: start the portable Postgres cluster at boot.
#
# Matches the CityDash web task -- SYSTEM, highest run level, boot trigger --
# so the database and the site that reads it come up the same way.
# pg_ctl drops to a restricted token when launched with admin rights, so
# running as SYSTEM is safe; postgres.exe itself never runs privileged.

$ErrorActionPreference = 'Stop'

$name = 'CityDashDb'

if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Output "removed existing $name"
}

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\apps\city-dash\ensure-db.ps1"'

$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

# No execution time limit. pg_ctl leaves postgres as a child of this task,
# so Task Scheduler considers the task "Running" for as long as the database
# is alive -- exactly as it does for the CityDash web task. Any finite limit
# would terminate the process tree and take Postgres down with it. PT0S here
# means unlimited, not zero.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings | Out-Null

Write-Output "registered $name (at startup, SYSTEM)"
