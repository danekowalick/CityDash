$ProgressPreference = 'SilentlyContinue'
foreach ($n in @('CityDash','CityDashIngest','CityDashQuick','CityDashBackfill')) {
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  if ($t) {
    $i = Get-ScheduledTaskInfo -TaskName $n
    Write-Output ($n.PadRight(18) + " state=" + $t.State.ToString().PadRight(8) +
                  " last=" + $i.LastRunTime + " result=" + $i.LastTaskResult +
                  " next=" + $i.NextRunTime)
  } else { Write-Output ($n.PadRight(18) + " NOT REGISTERED") }
}
