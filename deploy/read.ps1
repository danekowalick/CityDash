Write-Output "=== C:\apps ==="
Get-ChildItem C:\apps -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name | Out-String
Write-Output "=== backyard-tourney\run-server.ps1 ==="
Get-Content "C:\apps\backyard-tourney\run-server.ps1" -ErrorAction SilentlyContinue | Out-String
Write-Output "=== tourney dir top-level ==="
Get-ChildItem "C:\apps\backyard-tourney" -ErrorAction SilentlyContinue | Select-Object Name | Out-String
