# The web server.
#
# Waits for the database before starting Next. The site is server-rendered
# and every page reads Postgres, so coming up without it just means serving
# "the database could not be read" to anyone who visits.

Set-Location 'C:\apps\city-dash'
$env:NODE_ENV = 'production'

& powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\apps\city-dash\ensure-db.ps1' *>> 'C:\apps\city-dash\server.log'

& 'C:\Program Files\nodejs\node.exe' node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3002 *>> 'C:\apps\city-dash\server.log'
