#!/usr/bin/env bash
set -euo pipefail

python -m miquest.runtime migrate --database /data/miquest.sqlite3
python -m miquest.runtime serve --database /data/miquest.sqlite3 &
backend=$!
nginx -g 'daemon off;' &
proxy=$!
cleanup() {
    kill "$backend" "$proxy" 2>/dev/null || true
    wait "$backend" "$proxy" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT
wait -n "$backend" "$proxy"
exit 1
