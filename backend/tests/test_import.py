import asyncio
import json
from pathlib import Path

import httpx
from alembic import command
from alembic.config import Config
from pytest import MonkeyPatch
from sqlalchemy.orm import Session

from miquest import services
from miquest.api import create_app
from miquest.db import create_engine_for_path, make_session_factory
from miquest.errors import DomainError
from miquest.importer import ImportDocument
from miquest.models import Dependency


def test_import_preview_and_atomic_creation(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    engine = create_engine_for_path(tmp_path / 'import.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    app = create_app(make_session_factory(engine), allowed_hosts=('testserver',))
    document = {
        'version': 1,
        'project': {'name': 'Project'},
        'pages': [{'key': 'main', 'name': 'Main', 'quests': ['one', 'two']}],
        'quests': [
            {'key': 'one', 'title': 'One', 'homePage': 'main'},
            {'key': 'two', 'title': 'Two', 'homePage': 'main'},
        ],
        'dependencies': [{'quest': 'two', 'dependsOn': 'one'}],
    }

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            preview = await client.post('/api/v1/imports/preview', json=document)
            assert preview.status_code == 200, preview.text
            assert (await client.get('/api/v1/projects')).json()['data'] == []
            invalid = {**document, 'dependencies': [{'quest': 'two', 'dependsOn': 'one'}, {'quest': 'one', 'dependsOn': 'two'}]}
            assert (await client.post('/api/v1/imports', json=invalid)).status_code == 422
            missing_home = {**document, 'quests': [{'key': 'one', 'title': 'One', 'homePage': 'missing'}]}
            assert (await client.post('/api/v1/imports/preview', json=missing_home)).status_code == 422
            assert (await client.get('/api/v1/projects')).json()['data'] == []
            @services.mutation
            def fail_dependency(db: Session, quest_id: str, depends_on_quest_id: str) -> Dependency:
                raise DomainError('invalid_input')
            with monkeypatch.context() as patch:
                patch.setattr(services, 'add_dependency', fail_dependency)
                assert (await client.post('/api/v1/imports', json=document)).status_code == 422
                assert (await client.get('/api/v1/projects')).json()['data'] == []
            first = await client.post('/api/v1/imports', json=document)
            second = await client.post('/api/v1/imports', json=document)
            assert first.status_code == second.status_code == 201, first.text
            assert first.json()['data']['id'] != second.json()['data']['id']
            graph = (await client.get(f"/api/v1/projects/{first.json()['data']['id']}/graph")).json()['data']
            assert len(graph['quests']) == 2
            assert len(graph['dependencies']) == 1
            assert all(q['completionState'] == 'none' for q in graph['quests'])
            assert len({(a['x'], a['y']) for a in graph['appearances']}) == 2
            positions = {q['title']: next(a for a in graph['appearances'] if a['questId'] == q['id']) for q in graph['quests']}
            assert positions['One']['x'] < positions['Two']['x']

    asyncio.run(run())


def test_skill_schema_and_example_match_importer() -> None:
    references = Path(__file__).resolve().parents[2] / 'skills/miquest-project/references'
    schema = json.loads((references / 'project-v1.schema.json').read_text())
    assert schema == ImportDocument.model_json_schema(by_alias=True)
    ImportDocument.model_validate_json((references / 'example.json').read_text())
