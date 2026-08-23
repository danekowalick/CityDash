foreach ($n in @('BackyardTourney','EbmsKnowledgeBase')) {
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  if ($t) {
    Write-Output ("TASK: " + $n)
    foreach ($a in $t.Actions) {
      Write-Output ("  exec: " + $a.Execute)
      Write-Output ("  args: " + $a.Arguments)
      Write-Output ("  cwd : " + $a.WorkingDirectory)
    }
    Write-Output ("  user: " + $t.Principal.UserId + " runlevel=" + $t.Principal.RunLevel + " logon=" + $t.Principal.LogonType)
    foreach ($tr in $t.Triggers) { Write-Output ("  trig: " + $tr.CimClass.CimClassName) }
  }
}
Write-Output "=== disk ==="
Get-PSDrive C | Select-Object @{n='FreeGB';e={[math]::Round($_.Free/1GB,1)}},@{n='UsedGB';e={[math]::Round($_.Used/1GB,1)}} | Format-Table -AutoSize | Out-String
