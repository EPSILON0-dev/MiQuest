# Backend development

The Python API uses a local SQLite file and the routes in [the API contract](../docs/backend/README.md). It has no built-in accounts; run it on a trusted private network boundary only.

Install Python 3.12 or later and [uv](https://docs.astral.sh/uv/), then from the repository root:

```sh
uv sync --project backend --extra dev
backend/.venv/bin/python -m miquest.runtime migrate --database ./data/miquest.sqlite3
backend/.venv/bin/python -m miquest.runtime serve --database ./data/miquest.sqlite3
```

Migration explicitly creates the database and its parent directory. Serving requires an existing, up-to-date database and defaults to `127.0.0.1:8000`. Use `--allowed-host` for each permitted host when accessing via a trusted reverse proxy. Forwarded protocol headers are trusted only from loopback; the reverse proxy must set them itself. Keep the published port private; these checks are not authentication. The frontend still uses fixture state.

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
