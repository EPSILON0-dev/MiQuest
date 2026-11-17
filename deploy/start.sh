#!/usr/bin/env bash
set -euo pipefail

python -m miquest.runtime migrate --database /data/miquest.sqlite3
args=(--allowed-host localhost --allowed-host 127.0.0.1)
if [[ -n "${MIQUEST_ALLOWED_HOST:-}" ]]; then
    args+=(--allowed-host "$MIQUEST_ALLOWED_HOST")
fi
python -m miquest.runtime serve --database /data/miquest.sqlite3 "${args[@]}" &
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
