# Backend development

The Python API uses a local SQLite file and the routes in [the API contract](../docs/backend/README.md). It has no built-in accounts; run it on a trusted private network boundary only.

Install Python 3.12 or later and [uv](https://docs.astral.sh/uv/), then from the repository root:

```sh
uv sync --project backend --extra dev
backend/.venv/bin/python -m miquest.runtime migrate --database ./data/miquest.sqlite3
backend/.venv/bin/python -m miquest.runtime serve --database ./data/miquest.sqlite3
```

Migration explicitly creates the database and its parent directory. Serving requires an existing, up-to-date database and listens on `0.0.0.0:8000` by default and accepts all hostnames. Forwarded protocol headers are trusted only from loopback; the reverse proxy must set them itself. Restrict network access as needed; the application has no authentication. The frontend still uses fixture state.

Run the backend tests and type checker with:

```sh
cd backend
.venv/bin/pytest
.venv/bin/pyright
```

Pylance uses Pyright's type checker. The repository's pre-commit hook runs the same strict Pyright check for backend Python changes. Enable it after installing dependencies with `backend/.venv/bin/pre-commit install` from the repository root, or run it directly with `backend/.venv/bin/pre-commit run pyright --all-files`. Select `backend/.venv` as the Python interpreter in VS Code for Pylance.

To load the prototype's Atlas and Studio sample data, run this optional command after migration and before adding any data:

```sh
backend/.venv/bin/python -m miquest.runtime prefill --database ./data/miquest.sqlite3
```

Prefill requires an existing, migrated, empty database. It inserts the sample projects, trees, quests, graph, pins, and verification history in one transaction and refuses to run on a populated database. It is never run automatically.

## Verification and storage

Verification sends the quest context, current message and attachments to OpenRouter and the selected provider, and can incur charges. Choose a model that accepts images and structured outputs and save an OpenRouter API key in workspace settings before use. The key is not returned to the browser; deleting it locally does not revoke it at OpenRouter. Automated tests mock provider calls and do not contact OpenRouter; the integration has not been live-tested.

The database directory also contains `verification-settings.json` (mode 0600) and an `evidence` directory. Keep the entire directory private and back up the database using SQLite's backup API together with the evidence and settings files while the server is stopped for a consistent snapshot. Backups include the key and submitted evidence. Do not expose this directory through a web server.

Submissions accept up to five UTF-8 text files or static PNG, JPEG, GIF, WebP, BMP, and TIFF images. Limits are 10 MiB (10,485,760 bytes) per file and 25 MiB (26,214,400 bytes) total. Images are decoded with a 25-million-pixel limit; originals exist temporarily during a run, while history retains a quality-85 JPEG with orientation applied and transparency flattened on white. This copy may lose small details. Text is retained unchanged. Deleting a quest also deletes its evidence. On startup the server marks unfinished reviews interrupted and removes abandoned evidence; it takes an exclusive lock on the data directory, so run only one backend process per directory. Restarting never retries a review.

A timeout or interrupted connection can still incur provider charges even when usage is unavailable. If the filesystem refuses to remove an evidence file after its database deletion commits, a hidden staged file remains and startup retries its removal; check server logs and restore filesystem permissions if cleanup fails.
