$app = 'C:\apps\city-dash'
Write-Output ("node_modules present: " + (Test-Path "$app\node_modules"))
if (Test-Path "$app\node_modules") {
  Write-Output ("packages: " + (Get-ChildItem "$app\node_modules" -Directory).Count)
}
Write-Output ("next present: " + (Test-Path "$app\node_modules\next"))
Write-Output ("pdfjs present: " + (Test-Path "$app\node_modules\pdfjs-dist"))
