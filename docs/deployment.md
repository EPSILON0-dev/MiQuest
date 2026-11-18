# Deployment

Docker Compose builds a single image containing the frontend, nginx, and API. It binds to `0.0.0.0:8080` and stores the database, verification settings, and evidence in a named volume. Only one container may use the data directory at a time.

## Private access

MiQuest has no accounts or application-level authentication. The port is reachable on all interfaces. Restrict access with your firewall or a private network such as Tailscale.

## Backup and restore

For a consistent backup, stop the container and copy the whole data directory to a private location:

```sh
docker compose stop
docker compose cp miquest:/data ./miquest-backup
docker compose start
```

To restore, stop the container and copy the contents of the backup into an empty data volume, preserving ownership for UID 10001, before starting it. Backups contain your API key and submitted evidence. Keep the volume on local storage, not NFS or SMB. If mounting a host directory at `/data` instead, make it writable by UID 10001. `docker compose down` preserves the volume; `docker compose down -v` deletes all data.
