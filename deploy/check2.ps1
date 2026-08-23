$ProgressPreference = 'SilentlyContinue'
$db = 'C:\apps\city-dash\.localdb'
Write-Output ("initdb.exe : " + (Test-Path "$db\pgsql\bin\initdb.exe"))
Write-Output ("PG_VERSION : " + (Test-Path "$db\data\PG_VERSION"))
Write-Output ("zip removed: " + (-not (Test-Path "$db\pg.zip")))
if (Test-Path "$db\data\PG_VERSION") { Write-Output ("version: " + (Get-Content "$db\data\PG_VERSION")) }
