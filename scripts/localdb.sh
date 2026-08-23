#!/usr/bin/env bash
#
# Portable Postgres for local development.
#
# The binaries and data live entirely under .localdb/ (gitignored). Nothing is
# installed system-wide, and the whole thing is removed by deleting that
# folder. It listens on 55432 so it cannot collide with an existing Postgres
# on the default 5432.
#
#   ./scripts/localdb.sh start | stop | status | psql | destroy
#
set -euo pipefail

cd "$(dirname "$0")/.."

PGDIR=".localdb/pgsql/bin"
PGDATA="./.localdb/data"
PGPORT=55432
PGUSER=citydash
PGDB=citydash
LOGFILE="./.localdb/server.log"

if [ ! -d "$PGDIR" ]; then
  echo "Postgres binaries are missing from .localdb/pgsql." >&2
  echo "Download them with:" >&2
  echo "  curl -L https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip -o .localdb/pg.zip" >&2
  echo "  (cd .localdb && unzip -q pg.zip && rm pg.zip)" >&2
  exit 1
fi

case "${1:-status}" in
  start)
    if "$PGDIR/pg_isready.exe" -p "$PGPORT" -h localhost >/dev/null 2>&1; then
      echo "Already running on port $PGPORT."
      exit 0
    fi
    "$PGDIR/pg_ctl.exe" -D "$PGDATA" -l "$LOGFILE" -o "-p $PGPORT" start
    sleep 2
    "$PGDIR/pg_isready.exe" -p "$PGPORT" -h localhost
    ;;

  stop)
    "$PGDIR/pg_ctl.exe" -D "$PGDATA" -m fast stop
    ;;

  status)
    "$PGDIR/pg_isready.exe" -p "$PGPORT" -h localhost
    ;;

  psql)
    shift
    PGPASSWORD=citydash "$PGDIR/psql.exe" -h localhost -p "$PGPORT" -U "$PGUSER" -d "$PGDB" "$@"
    ;;

  destroy)
    # Deliberately explicit: this throws away every ingested record.
    read -r -p "Delete the local database and all ingested data? [y/N] " reply
    case "$reply" in
      [yY]*)
        "$PGDIR/pg_ctl.exe" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
        rm -rf "$PGDATA"
        echo "Removed $PGDATA. Re-create it with initdb (see README)."
        ;;
      *) echo "Cancelled." ;;
    esac
    ;;

  *)
    echo "Usage: $0 {start|stop|status|psql|destroy}" >&2
    exit 1
    ;;
esac
