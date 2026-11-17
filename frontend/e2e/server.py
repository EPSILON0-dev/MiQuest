import os
import json
import sqlite3
from pathlib import Path

import uvicorn
from miquest import openrouter
from miquest.runtime import build_app, migrate_database
from miquest.prefill import prefill_database

def forbid_provider_network(*_args, **_kwargs):
    raise AssertionError('Browser tests must not contact OpenRouter')

openrouter.urlopen = forbid_provider_network
openrouter.list_models = lambda: [{
    'id': 'mock/reviewer', 'name': 'Mock reviewer', 'contextLength': 131072,
    'maxOutputTokens': 16384, 'efforts': ['none', 'low', 'medium', 'high'],
}]
openrouter.complete = lambda request, key: {
    'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({
        'verdict': 'inconclusive', 'reasoning': 'More evidence is needed.', 'unmetCriteria': [],
    })}}],
}

root = Path(os.environ['MIQUEST_E2E_DIR'])
database = root / 'test.sqlite3'
migrate_database(database)
prefill_database(database)
with sqlite3.connect(database) as source, sqlite3.connect(root / 'seed.sqlite3') as target:
    source.backup(target)
uvicorn.run(build_app(database), host='127.0.0.1', port=18080)
