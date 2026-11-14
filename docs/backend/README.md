# Backend contracts

The API specification and database diagram are based on [BACKEND_DRAFT.md](../../BACKEND_DRAFT.md); [DESIGN.md](../../DESIGN.md) remains authoritative. The backend has been implemented in `backend/`; the Phase A UI still uses fixtures and remains pending approval.

- **API:** [openapi.json](openapi.json) is the OpenAPI 3.1 source. To browse it with Redoc, run `python3 -m http.server 8000` from the repository root and open `http://localhost:8000/docs/backend/api.html`. The viewer loads Redoc from its CDN and requires internet access. Alternatively import the JSON into an OpenAPI editor.
- **Database:** Paste [schema.dbml](schema.dbml) into the browser editor at [dbdiagram.io](https://dbdiagram.io/). DBML depicts the proposed tables and composite relationships; the SQL in the draft remains the source for SQLite checks, cascades, deferred constraints, and the immutability trigger. Alembic's version table is omitted.

The DBML diagram is documentation rather than a migration. SQLite migration and foreign-key tests live in `backend/`. See [backend development instructions](../../backend/README.md) to run the API and its tests.
