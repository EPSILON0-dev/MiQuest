import asyncio
import json
from pathlib import Path
from typing import Any, NoReturn

import httpx
from alembic import command
from alembic.config import Config
from pytest import MonkeyPatch
from sqlalchemy.orm import Session

from miquest.api import create_app
from miquest.db import create_engine_for_path, make_session_factory
from miquest.models import Project


def test_api_contract(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'test.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    app = create_app(make_session_factory(engine), allowed_hosts=('testserver',))

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            for body in ({'name': ' '}, {'name': 'Project', 'revision': 1}):
                response = await client.post('/api/v1/projects', json=body)
                assert response.status_code == 422
                assert response.json()['error']['code'] == 'invalid_input'
            assert (await client.get('/readyz')).status_code == 200
            response = await client.post('/api/v1/projects', json={'name': 'Project'})
            assert response.status_code == 201, response.text
            project = response.json()['data']['id']
            response = await client.post(f'/api/v1/projects/{project}/pages', json={'name': 'Page', 'expectedRevision': 0})
            assert response.status_code == 201, response.text
            page = response.json()['data']['id']
            response = await client.post(f'/api/v1/projects/{project}/quests', json={'title': 'Quest', 'pageId': page, 'x': 1, 'y': 2, 'expectedRevision': 1})
            assert response.status_code == 201, response.text
            quest = response.json()['data']['quest']['id']
            assert response.json()['projectRevision'] == 2
            response = await client.patch(f'/api/v1/quests/{quest}', json={'title': 'Changed', 'expectedRevision': 1})
            assert response.status_code == 409
            assert response.json()['error']['code'] == 'stale_revision'
            response = await client.get(f'/api/v1/pages/{page}/graph')
            assert response.status_code == 200, response.text
            assert response.json()['data']['quests'][0]['title'] == 'Quest'
            response = await client.post(f'/api/v1/quests/{quest}/override', json={'expectedRevision': 2, 'reason': 'Checked', 'confirmOverride': True})
            assert response.status_code == 201, response.text
            assert response.json()['data']['verification']['actor'] == 'human'
            assert response.json()['data']['verification']['snapshot']['title'] == 'Quest'
            response = await client.get(f'/api/v1/quests/{quest}/verifications?limit=1')
            assert response.status_code == 200, response.text
            assert len(response.json()['data']['items']) == 1
            response = await client.post(f'/api/v1/quests/{quest}/reopen', json={'expectedRevision': 3, 'reason': 'Retry'})
            assert response.status_code == 201, response.text
            assert response.json()['data']['quest']['completionState'] == 'none'
            response = await client.request('DELETE', f'/api/v1/quests/{quest}', json={'expectedRevision': 4, 'confirmDelete': False})
            assert response.status_code == 422
            response = await client.post(f'/api/v1/projects/{project}/quests', content='{"title":"Q","pageId":"p","x":NaN,"y":0,"expectedRevision":2}', headers={'content-type': 'application/json'})
            assert response.status_code == 422
            assert (await client.post('/api/v1/projects', json={'name': 'X'}, headers={'origin': 'https://evil.example'})).status_code == 403
            assert (await client.get('/healthz', headers={'host': 'evil.example'})).status_code == 400
    asyncio.run(run())


def test_unmigrated_database_is_not_ready(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'empty.sqlite')
    app = create_app(make_session_factory(engine), allowed_hosts=('testserver',))

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            assert (await client.get('/healthz')).status_code == 200
            assert (await client.get('/readyz')).status_code == 503
            assert (await client.post('/api/v1/projects', content='{}')).status_code == 415
    asyncio.run(run())


def test_openapi_declares_path_parameters_and_delete_bodies() -> None:
    app = create_app(Session, allowed_hosts=('testserver',))
    spec = app.openapi()
    canonical = json.loads((Path(__file__).resolve().parents[2] / 'docs/backend/openapi.json').read_text())
    assert spec == canonical
    operation = spec['paths']['/projects/{projectId}']['delete']
    assert any(item['name'] == 'projectId' and item['in'] == 'path' for item in operation['parameters'])
    assert operation['requestBody']['required'] is True


def test_review_contract_describes_response_and_provider_failure() -> None:
    spec = create_app(Session, allowed_hosts=('testserver',)).openapi()
    schemas = spec['components']['schemas']
    run = schemas['ReviewRun']
    assert set(run['required']) == {
        'id', 'questId', 'status', 'createdAt', 'updatedAt', 'message', 'model', 'effort',
        'verdict', 'reasoning', 'unmetCriteria', 'completionApplied', 'error', 'usage', 'attachments',
    }
    assert set(run['properties']['status']['enum']) == {'waiting', 'reviewing', 'saving', 'completed', 'error', 'interrupted'}
    assert schemas['ReviewUsage']['required'] == []
    assert {'generationId', 'inputTokens', 'outputTokens', 'totalCost'} <= schemas['ReviewUsage']['properties'].keys()
    for path, method in (('/verification-models', 'get'), ('/quests/{questId}/review-runs', 'post')):
        assert '503' in spec['paths'][path][method]['responses']


def test_all_rest_operations(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'all.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    app = create_app(make_session_factory(engine), allowed_hosts=('testserver',))

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            revision = 0
            async def call(method: str, path: str, body: dict[str, object] | None = None, status: int = 200) -> Any:
                nonlocal revision
                response = await client.request(method, '/api/v1' + path, json=body)
                assert response.status_code == status, response.text
                result = response.json()
                if 'projectRevision' in result:
                    revision = result['projectRevision']
                return result['data']
            async def write(method: str, path: str, **fields: object) -> Any:
                return await call(method, path, {'expectedRevision': revision, **fields})
            project = (await call('POST', '/projects', {'name': 'P'}, 201))['id']
            assert len(await call('GET', '/projects')) == 1
            assert (await call('GET', f'/projects/{project}'))['name'] == 'P'
            await write('PATCH', f'/projects/{project}', name='Renamed')
            page1 = (await call('POST', f'/projects/{project}/pages', {'expectedRevision': revision, 'name': 'First'}, 201))['id']
            page2 = (await call('POST', f'/projects/{project}/pages', {'expectedRevision': revision, 'name': 'Second'}, 201))['id']
            assert len(await call('GET', f'/projects/{project}/pages')) == 2
            assert (await call('GET', f'/pages/{page1}'))['name'] == 'First'
            await write('PATCH', f'/pages/{page1}', name='Changed')
            quest1 = (await call('POST', f'/projects/{project}/quests', {'expectedRevision': revision, 'title': 'A', 'pageId': page1, 'x': 0, 'y': 0}, 201))['quest']['id']
            quest2 = (await call('POST', f'/projects/{project}/quests', {'expectedRevision': revision, 'title': 'B', 'pageId': page2, 'x': 1, 'y': 1}, 201))['quest']['id']
            assert len(await call('GET', f'/projects/{project}/quests')) == 2
            assert (await call('GET', f'/quests/{quest1}'))['quest']['title'] == 'A'
            await write('PATCH', f'/quests/{quest1}', title='Updated')
            await write('PUT', f'/pages/{page2}/quests/{quest1}', x=3, y=4)
            await write('PATCH', f'/pages/{page2}/quests/{quest1}', x=5, y=6)
            await write('PUT', f'/pages/{page2}/positions', positions=[{'questId': quest1, 'x': 7, 'y': 8}])
            await write('DELETE', f'/pages/{page2}/quests/{quest1}')
            dependency = await call('POST', f'/quests/{quest2}/dependencies', {'expectedRevision': revision, 'dependsOnQuestId': quest1}, 201)
            assert dependency == {'questId': quest2, 'dependsOnQuestId': quest1}
            page_graph = await call('GET', f'/pages/{page2}/graph')
            assert page_graph['externalLinks'][0]['remoteQuest']['id'] == quest1
            graph = await call('GET', f'/projects/{project}/graph')
            assert len(graph['dependencies']) == 1
            await write('DELETE', f'/quests/{quest2}/dependencies/{quest1}')
            pin = await write('PUT', f'/projects/{project}/pins/{quest1}')
            assert pin['sortOrder'] == 0
            assert len(await call('GET', f'/projects/{project}/pins')) == 1
            await write('PUT', f'/projects/{project}/pin-order', questIds=[quest1])
            assert (await write('DELETE', f'/projects/{project}/pins/{quest1}'))['questId'] == quest1
            assert 'compass' in (await call('GET', '/icons'))['names']
            assert (await write('DELETE', f'/quests/{quest1}', confirmDelete=True))['deletedId'] == quest1
            assert (await write('DELETE', f'/pages/{page1}', confirmDelete=True, questActions=[]))['deletedId'] == page1
            assert (await write('DELETE', f'/projects/{project}', confirmDelete=True))['deletedId'] == project
    asyncio.run(run())


def test_domain_error_statuses(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    from miquest import services
    from miquest.errors import DomainError
    engine = create_engine_for_path(tmp_path / 'errors.sqlite')
    app = create_app(make_session_factory(engine), allowed_hosts=('testserver',))
    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            for code, expected in [('project_not_found', 404), ('dependency_cycle', 409), ('invalid_icon', 422), ('database_busy', 503), ('internal_error', 500)]:
                def fail(db: Session, error_code: str = code) -> NoReturn:
                    raise DomainError(error_code)
                monkeypatch.setattr(services, 'list_projects', fail)
                response = await client.get('/api/v1/projects')
                assert response.status_code == expected
                assert response.json()['error']['code'] == code
                if code == 'database_busy':
                    assert response.headers['retry-after'] == '1'
    asyncio.run(run())


def test_mutation_response_revision_and_data_share_snapshot(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    from miquest import services

    engine = create_engine_for_path(tmp_path / 'concurrent.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    factory = make_session_factory(engine)
    with factory() as db:
        project = services.create_project(db, 'Initial')
        project_id = project.id
    original = services.update_project
    def update_then_concurrent(db: Session, project_id: str, expected_revision: int | None = None, **fields: object) -> Project:
        result = original(db, project_id, expected_revision, **fields)
        with factory() as other:
            original(other, project_id, expected_revision=1, name='Concurrent')
        return result
    monkeypatch.setattr(services, 'update_project', update_then_concurrent)
    app = create_app(factory, allowed_hosts=('testserver',))
    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            response = await client.patch(f'/api/v1/projects/{project_id}', json={'expectedRevision': 0, 'name': 'First'})
            assert response.status_code == 200
            assert response.json()['projectRevision'] == 1
            assert response.json()['data']['name'] == 'First'
            assert response.json()['data']['revision'] == 1
    asyncio.run(run())


def test_successful_mutation_survives_concurrent_deletion(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    from miquest import services

    engine = create_engine_for_path(tmp_path / 'deleted.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    factory = make_session_factory(engine)
    with factory() as db:
        project_id = services.create_project(db, 'Initial').id
    original = services.update_project
    def update_then_delete(db: Session, project_id: str, expected_revision: int | None = None, **fields: object) -> Project:
        result = original(db, project_id, expected_revision, **fields)
        with factory() as other:
            services.delete_project(other, project_id, confirm_delete=True, expected_revision=1)
        return result
    monkeypatch.setattr(services, 'update_project', update_then_delete)
    app = create_app(factory, allowed_hosts=('testserver',))
    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            response = await client.patch(f'/api/v1/projects/{project_id}', json={'expectedRevision': 0, 'name': 'First'})
            assert response.status_code == 200
            assert response.json()['data']['name'] == 'First'
            assert response.json()['data']['revision'] == response.json()['projectRevision'] == 1
            assert (await client.get(f'/api/v1/projects/{project_id}')).status_code == 404
    asyncio.run(run())


def test_agent_verification_endpoint(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'verdict.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    app = create_app(make_session_factory(engine), allowed_hosts=('testserver',))
    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            p = (await client.post('/api/v1/projects', json={'name': 'P'})).json()['data']['id']
            page = (await client.post(f'/api/v1/projects/{p}/pages', json={'name': 'P', 'expectedRevision': 0})).json()['data']['id']
            first = (await client.post(f'/api/v1/projects/{p}/quests', json={'title': 'A', 'pageId': page, 'x': 0, 'y': 0, 'expectedRevision': 1})).json()['data']['quest']['id']
            second = (await client.post(f'/api/v1/projects/{p}/quests', json={'title': 'B', 'pageId': page, 'x': 0, 'y': 0, 'expectedRevision': 2})).json()['data']['quest']['id']
            await client.post(f'/api/v1/quests/{second}/dependencies', json={'dependsOnQuestId': first, 'expectedRevision': 3})
            path = f'/api/v1/quests/{second}/verifications'
            for body in [
                {'verdict': 'override', 'reasoning': 'R', 'expectedRevision': 4},
                {'verdict': 'pass', 'reasoning': 'R', 'evidence': 'E', 'actor': 'human', 'expectedRevision': 4},
                {'verdict': 'pass', 'reasoning': 'R', 'expectedRevision': 4},
            ]:
                assert (await client.post(path, json=body)).status_code == 422
            locked = await client.post(path, json={'verdict': 'pass', 'reasoning': 'R', 'evidence': 'E', 'expectedRevision': 4})
            assert locked.status_code == 409
            assert locked.json()['error']['code'] == 'prerequisites_unsatisfied'
            for revision, verdict in [(4, 'fail'), (5, 'inconclusive')]:
                response = await client.post(path, json={'verdict': verdict, 'reasoning': 'R', 'expectedRevision': revision})
                assert response.status_code == 201, response.text
                assert response.json()['data']['verification']['actor'] == 'agent'
                assert response.json()['data']['quest']['completionState'] == 'none'
            response = await client.post(f'/api/v1/quests/{first}/verifications', json={'verdict': 'pass', 'reasoning': 'R', 'evidence': 'E', 'expectedRevision': 6})
            assert response.status_code == 201, response.text
            response = await client.post(path, json={'verdict': 'pass', 'reasoning': 'R', 'evidence': 'E', 'expectedRevision': 7})
            assert response.status_code == 201, response.text
            assert response.json()['data']['quest']['completionState'] == 'verified'
            assert response.json()['data']['verification']['actor'] == 'agent'
    asyncio.run(run())


def test_commit_failure_never_returns_snapshot(tmp_path: Path) -> None:
    from sqlalchemy import select
    from sqlalchemy.orm import sessionmaker

    engine = create_engine_for_path(tmp_path / 'failed.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    class FailingSession(Session):
        def commit(self) -> None:
            raise RuntimeError('commit failed')
    app = create_app(sessionmaker(bind=engine, class_=FailingSession, expire_on_commit=False), allowed_hosts=('testserver',))
    async def run() -> None:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url='http://testserver') as client:
            response = await client.post('/api/v1/projects', json={'name': 'P'})
            assert response.status_code == 500
            assert response.json()['error']['code'] == 'internal_error'
            assert 'data' not in response.json()
    asyncio.run(run())
    with make_session_factory(engine)() as db:
        assert list(db.scalars(select(Project))) == []


def test_tree_draft_is_atomic_and_rejects_cross_project_changes(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'draft.sqlite')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    app = create_app(make_session_factory(engine), allowed_hosts=('testserver',))

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            p = (await client.post('/api/v1/projects', json={'name': 'P'})).json()['data']['id']
            other = (await client.post('/api/v1/projects', json={'name': 'Other'})).json()['data']['id']
            page = (await client.post(f'/api/v1/projects/{p}/pages', json={'name': 'Page', 'expectedRevision': 0})).json()['data']['id']
            other_page = (await client.post(f'/api/v1/projects/{other}/pages', json={'name': 'Other', 'expectedRevision': 0})).json()['data']['id']
            quest = (await client.post(f'/api/v1/projects/{p}/quests', json={'title': 'Original', 'pageId': page, 'x': 0, 'y': 0, 'expectedRevision': 1})).json()['data']['quest']['id']
            foreign = (await client.post(f'/api/v1/projects/{other}/quests', json={'title': 'Foreign', 'pageId': other_page, 'x': 0, 'y': 0, 'expectedRevision': 1})).json()['data']['quest']['id']
            path = f'/api/v1/projects/{p}/tree-draft'
            edit = {'operation': 'update_quest', 'arguments': {'questId': quest, 'title': 'Changed'}}
            cycle = {'operation': 'add_dependency', 'arguments': {'questId': quest, 'dependsOnQuestId': quest}}
            rejected = await client.post(path, json={'expectedRevision': 2, 'operations': [edit, cycle]})
            assert rejected.status_code == 422, rejected.text
            assert (await client.get(f'/api/v1/quests/{quest}')).json()['data']['quest']['title'] == 'Original'
            cross_project = {'operation': 'update_quest', 'arguments': {'questId': foreign, 'title': 'Wrong'}}
            rejected = await client.post(path, json={'expectedRevision': 2, 'operations': [edit, cross_project]})
            assert rejected.status_code == 422, rejected.text
            assert (await client.get(f'/api/v1/quests/{foreign}')).json()['data']['quest']['title'] == 'Foreign'
            assert (await client.get(f'/api/v1/quests/{quest}')).json()['data']['quest']['title'] == 'Original'
            create = {'operation': 'create_quest', 'clientId': 'temp', 'arguments': {'pageId': page, 'title': 'New', 'x': 3, 'y': 4}}
            link = {'operation': 'add_dependency', 'arguments': {'questId': 'temp', 'dependsOnQuestId': quest}}
            saved = await client.post(path, json={'expectedRevision': 2, 'operations': [edit, create, link]})
            assert saved.status_code == 200, saved.text
            new_id = saved.json()['data']['ids']['temp']
            assert saved.json()['projectRevision'] == 5
            graph = (await client.get(f'/api/v1/projects/{p}/graph')).json()['data']
            assert any(q['id'] == quest and q['title'] == 'Changed' for q in graph['quests'])
            assert any(d['questId'] == new_id and d['dependsOnQuestId'] == quest for d in graph['dependencies'])
            bad_edit = {'operation': 'update_quest', 'arguments': {'questId': quest, 'title': 'Must roll back'}}
            closes_cycle = {'operation': 'add_dependency', 'arguments': {'questId': quest, 'dependsOnQuestId': new_id}}
            cycle_response = await client.post(path, json={'expectedRevision': 5, 'operations': [bad_edit, closes_cycle]})
            assert cycle_response.status_code == 409
            assert cycle_response.json()['error']['code'] == 'dependency_cycle'
            assert (await client.get(f'/api/v1/quests/{quest}')).json()['data']['quest']['title'] == 'Changed'
            invalid = await client.post(path, json={'expectedRevision': 5, 'operations': [bad_edit, {'operation': 'delete_quest', 'arguments': {'questId': new_id}}]})
            assert invalid.status_code == 422
            assert (await client.get(f'/api/v1/quests/{quest}')).json()['data']['quest']['title'] == 'Changed'
            stale = await client.post(path, json={'expectedRevision': 2, 'operations': [edit]})
            assert stale.status_code == 409
            assert stale.json()['error']['code'] == 'stale_revision'
    asyncio.run(run())


def test_verification_settings_api(tmp_path: Path) -> None:
    path = tmp_path / 'verification-settings.json'
    app = create_app(Session, allowed_hosts=('testserver',), settings_path=path)

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            url = '/api/v1/verification-settings'
            assert (await client.get(url)).json()['data']['configured'] is False
            response = await client.put(url, json={'key': 'sk-test-123456789', 'model': 'example/model', 'effort': 'medium'})
            assert response.status_code == 200
            assert response.json()['data'] == {'configured': True, 'keyMask': 'key-****23456789', 'model': 'example/model', 'effort': 'medium'}
            assert 'sk-test-123456789' not in response.text
            response = await client.put(url, json={'model': 'example/other', 'effort': ''})
            assert response.json()['data']['configured'] is True
            response = await client.put(url, json={'key': '\nsecret', 'model': '', 'effort': ''})
            assert response.status_code == 422
            assert (await client.get(url)).json()['data']['model'] == 'example/other'
            response = await client.put(url, json={'key': '', 'model': '', 'effort': ''})
            assert response.json()['data']['configured'] is False
    asyncio.run(run())
