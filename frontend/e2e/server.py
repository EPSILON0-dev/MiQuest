import os
import sqlite3
from pathlib import Path

import uvicorn
from miquest.runtime import build_app, migrate_database
from miquest.prefill import prefill_database

root = Path(os.environ['MIQUEST_E2E_DIR'])
database = root / 'test.sqlite3'
migrate_database(database)
prefill_database(database)
with sqlite3.connect(database) as source, sqlite3.connect(root / 'seed.sqlite3') as target:
    source.backup(target)
uvicorn.run(build_app(database), host='127.0.0.1', port=18080)
