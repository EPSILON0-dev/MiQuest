# Deployment

Docker Compose builds a single image containing the frontend, nginx, and API. It binds to `127.0.0.1:8080` and stores the database, verification settings, and evidence in a named volume. Only one container may use the data directory at a time.

## Private access

MiQuest has no accounts or application-level authentication. Use Tailscale Serve to expose the loopback port privately, restrict access with your tailnet controls, and do not expose the app directly to the internet. Set `MIQUEST_ALLOWED_HOST` to the Tailscale hostname (without scheme or port) before starting Compose.

## Backup and restore

For a consistent backup, stop the container and copy the whole data directory to a private location:

```sh
docker compose stop
docker compose cp miquest:/data ./miquest-backup
docker compose start
```

To restore, stop the container and copy the contents of the backup into an empty data volume, preserving ownership for UID 10001, before starting it. Backups contain your API key and submitted evidence. Keep the volume on local storage, not NFS or SMB. If mounting a host directory at `/data` instead, make it writable by UID 10001. `docker compose down` preserves the volume; `docker compose down -v` deletes all data.
