$ErrorActionPreference = 'Stop'
$app  = 'C:\apps\city-dash'
$db   = "$app\.localdb"
$zip  = "$db\pg.zip"
$bin  = "$db\pgsql\bin"

New-Item -ItemType Directory -Force -Path $db | Out-Null

if (-not (Test-Path "$bin\initdb.exe")) {
  Write-Output "Downloading portable Postgres..."
  Invoke-WebRequest -UseBasicParsing `
    -Uri "https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip" `
    -OutFile $zip
  Write-Output ("downloaded: " + [math]::Round((Get-Item $zip).Length/1MB,1) + " MB")
  Expand-Archive -Path $zip -DestinationPath $db -Force
  Remove-Item $zip -Force
}
Write-Output ("initdb present: " + (Test-Path "$bin\initdb.exe"))

if (-not (Test-Path "$db\data\PG_VERSION")) {
  $pw = "$db\pwfile"
  Set-Content -Path $pw -Value "citydash" -Encoding ascii -NoNewline
  & "$bin\initdb.exe" -D "$db\data" -U citydash --pwfile="$pw" --auth=scram-sha-256 --encoding=UTF8 2>&1 | Select-Object -Last 2
  Remove-Item $pw -Force
}
Write-Output ("data dir initialised: " + (Test-Path "$db\data\PG_VERSION"))
Write-Output "STAGE2_OK"
