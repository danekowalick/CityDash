Write-Output "=== node processes and how they were started ==="
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
  $c = $_.CommandLine
  if ($c.Length -gt 160) { $c = $c.Substring(0,160) }
  Write-Output ("PID " + $_.ProcessId + " :: " + $c)
}
Write-Output "=== scheduled tasks that look app-related ==="
Get-ScheduledTask -ErrorAction SilentlyContinue |
  Where-Object { $_.TaskName -match 'tourney|kb|knowledge|node|next|player|citydash|ebms' } |
  Select-Object TaskName,State,TaskPath | Format-Table -AutoSize | Out-String
Write-Output "=== services that look app-related ==="
Get-Service -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'nssm|pm2|tourney|node|kb|ebms' } |
  Select-Object Name,Status,StartType | Format-Table -AutoSize | Out-String
Write-Output "=== pm2 present? ==="
if (Get-Command pm2 -ErrorAction SilentlyContinue) { pm2 list } else { Write-Output "pm2: not installed" }
Write-Output "=== likely app dirs ==="
Get-ChildItem "$env:USERPROFILE" -Directory -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty Name | Out-String
