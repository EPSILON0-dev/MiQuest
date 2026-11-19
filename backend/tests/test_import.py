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
    app = create_app(make_session_factory(engine))
    document = {
        'version': 2,
        'project': {'name': 'Project'},
        'pages': [{'key': 'main', 'name': 'Main', 'quests': ['one', 'two'], 'positions': [{'quest': 'one', 'x': 0, 'y': 0}, {'quest': 'two', 'x': 160, 'y': 0}]}],
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
    schema = json.loads((references / 'project-v2.schema.json').read_text())
    assert schema == ImportDocument.model_json_schema(by_alias=True)
    ImportDocument.model_validate_json((references / 'example.json').read_text())
    ImportDocument.model_validate_json((references / 'os-example.json').read_text())


def test_v2_positions_and_emoji_are_validated_and_persisted(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'v2.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    app = create_app(make_session_factory(engine))
    document = {'version': 2, 'project': {'name': 'Project'}, 'pages': [
        {'key': 'main', 'name': 'Main', 'quests': ['one'], 'layout': 'spiral'}],
        'quests': [{'key': 'one', 'title': 'One', 'homePage': 'main', 'iconName': 'emoji:👍🏽'}]}

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            assert (await client.post('/api/v1/imports/preview', json=document)).status_code == 200
            assert (await client.post('/api/v1/imports', json=document)).status_code == 422
            assert (await client.post('/api/v1/imports/preview', json={**document, 'bypassAutoLayout': True})).status_code == 422
            page = {'key': 'main', 'name': 'Main', 'quests': ['one'], 'layout': 'spiral',
                    'positions': [{'quest': 'one', 'x': 42, 'y': -7}]}
            ready = {**document, 'pages': [page], 'bypassAutoLayout': True}
            result = await client.post('/api/v1/imports', json=ready)
            assert result.status_code == 201, result.text
            graph = (await client.get(f"/api/v1/projects/{result.json()['data']['id']}/graph")).json()['data']
            assert graph['pages'][0]['layout'] == 'spiral'
            assert graph['quests'][0]['icon'] == 'emoji:👍🏽'
            assert (graph['appearances'][0]['x'], graph['appearances'][0]['y']) == (42, -7)
            bad = {**ready, 'pages': [{**page, 'positions': [{'quest': 'missing', 'x': 0, 'y': 0}]}]}
            assert (await client.post('/api/v1/imports/preview', json=bad)).status_code == 422
            assert (await client.post('/api/v1/imports/preview', json={**document, 'version': 1})).status_code == 422
            bad_icon = {**document, 'quests': [{'key': 'one', 'title': 'One', 'homePage': 'main', 'iconName': 'emoji:😀😀'}]}
            assert (await client.post('/api/v1/imports/preview', json=bad_icon)).status_code == 422
    asyncio.run(run())


def test_import_preserves_progress_and_text_evidence_with_fresh_history_ids(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'progress.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    app = create_app(make_session_factory(engine))
    document: dict[str, object] = {
        'version': 2, 'project': {'name': 'Saved'},
        'bypassAutoLayout': True,
        'pages': [{'key': 'main', 'name': 'Main', 'quests': ['done', 'parent', 'active'], 'positions': [
            {'quest': 'done', 'x': 0, 'y': 0}, {'quest': 'parent', 'x': 160, 'y': 0}, {'quest': 'active', 'x': 320, 'y': 0}]}],
        'quests': [
            {'key': 'done', 'title': 'Done', 'homePage': 'main', 'workState': 'blocked', 'completionState': 'verified',
             'verifications': [{'key': 'source-event', 'sequence': 1, 'verdict': 'pass', 'actor': 'agent',
                'evidence': 'Reviewed source and output.', 'reasoning': 'All criteria pass.', 'createdAt': '2026-11-18T10:00:00Z',
                'snapshot': {'title': 'Done', 'prerequisites': [{'questId': 'parent', 'latestCompletionEventId': 'parent-event'}]}}]},
            {'key': 'parent', 'title': 'Parent', 'homePage': 'main', 'completionState': 'verified',
             'verifications': [{'key': 'parent-event', 'sequence': 1, 'verdict': 'pass', 'actor': 'agent',
                'evidence': 'Parent proof.', 'reasoning': 'Parent criteria pass.', 'createdAt': '2026-11-17T10:00:00Z',
                'snapshot': {'title': 'Parent', 'prerequisites': []}}]},
            {'key': 'active', 'title': 'Active', 'homePage': 'main', 'workState': 'in_progress'},
        ],
    }

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            ids: list[str] = []
            parent_ids: list[str] = []
            for _ in range(2):
                response = await client.post('/api/v1/imports', json=document)
                assert response.status_code == 201, response.text
                graph = (await client.get(f"/api/v1/projects/{response.json()['data']['id']}/graph")).json()['data']
                by_title = {quest['title']: quest for quest in graph['quests']}
                assert by_title['Done']['workState'] == 'blocked'
                assert by_title['Done']['completionState'] == 'verified'
                assert by_title['Active']['workState'] == 'in_progress'
                history = (await client.get(f"/api/v1/quests/{by_title['Done']['id']}/verifications")).json()['data']['items']
                assert history[0]['evidence'] == 'Reviewed source and output.'
                assert history[0]['snapshot']['prerequisites'][0]['questId'] == by_title['Parent']['id']
                parent_history = (await client.get(f"/api/v1/quests/{by_title['Parent']['id']}/verifications")).json()['data']['items']
                assert history[0]['snapshot']['prerequisites'][0]['latestCompletionEventId'] == parent_history[0]['id']
                ids.append(history[0]['id'])
                parent_ids.append(parent_history[0]['id'])
            assert ids[0] != ids[1]
            assert parent_ids[0] != parent_ids[1]

    asyncio.run(run())
