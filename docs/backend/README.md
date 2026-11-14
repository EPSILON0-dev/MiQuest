# Backend contracts

The backend is implemented in `backend/`; the Phase A UI still uses fixtures and remains pending approval. [DESIGN.md](../../DESIGN.md) remains authoritative for product scope.

- **API:** [openapi.json](openapi.json) is the OpenAPI 3.1 source. To browse it with Redoc, run `python3 -m http.server 8000` from the repository root and open `http://localhost:8000/docs/backend/api.html`. The viewer loads Redoc from its CDN and requires internet access. Alternatively import the JSON into an OpenAPI editor.
- **Database:** Paste [schema.dbml](schema.dbml) into the browser editor at [dbdiagram.io](https://dbdiagram.io/). DBML depicts tables and relationships; runtime constraints and migrations are implemented in `backend/`. Alembic's version table is omitted.

The DBML diagram is documentation rather than a migration. SQLite migration and foreign-key tests live in `backend/`. See [backend development instructions](../../backend/README.md) to run the API and its tests.
