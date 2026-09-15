# The web server.
#
# Asks for the database first, but starts Next whatever the answer. The web
# server must never wait on the database: on 2026-09-14 it sat behind a
# hung database start for nine hours and the site returned 502. Every page
# reads Postgres per request, so if the database arrives late the site
# shows "could not be read" briefly and then recovers on its own.

Set-Location 'C:\apps\city-dash'
$env:NODE_ENV = 'production'

& powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\apps\city-dash\ensure-db.ps1' *>> 'C:\apps\city-dash\server.log'

& 'C:\Program Files\nodejs\node.exe' node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3002 *>> 'C:\apps\city-dash\server.log'
