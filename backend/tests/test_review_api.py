import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
from pytest import MonkeyPatch
from sqlalchemy.orm import Session

from miquest.api import create_app
from miquest.openrouter import complete as real_completion_adapter


def test_review_model_catalog_and_upload_limit(tmp_path: Path) -> None:
    app = create_app(Session, settings_path=tmp_path / 'settings.json')

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            response = await client.get('/api/v1/verification-models')
            assert response.json()['data'][0]['id'] == 'mock/reviewer'
            response = await client.post('/api/v1/quests/q/review-runs', files={'files': ('large.txt', b'a' * (26 * 1024 * 1024))}, data={'message': 'proof'})
            assert response.status_code == 413
    asyncio.run(run())


def test_review_api_submission_and_lock(tmp_path: Path, monkeypatch: object) -> None:
    import threading

    from pytest import MonkeyPatch

    from miquest import review_runs, services
    from miquest.db import create_engine_for_path, make_session_factory
    from miquest.models import Base

    engine = create_engine_for_path(tmp_path / 'database.sqlite')
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as db:
        project = services.create_project(db, 'Project')
        page = services.create_page(db, project.id, 'Page')
        quest, _ = services.create_quest(db, project.id, 'Quest', page.id, 0, 0)
        quest_id = quest.id
    gate = threading.Event()
    original = review_runs.execute_run
    def blocked_worker(factory: object, run_id: str, key: str) -> None:
        gate.wait(timeout=10)
        original(factory, run_id, key)  # type: ignore[arg-type]
    assert isinstance(monkeypatch, MonkeyPatch)
    monkeypatch.setattr(review_runs, 'execute_run', blocked_worker)
    app = create_app(factory, settings_path=tmp_path / 'settings.json')

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            url = f'/api/v1/quests/{quest_id}/review-runs'
            missing = await client.post(url, data={'message': 'proof'}, files={'files': ('p.txt', b'proof')})
            assert missing.status_code == 422
            configured = await client.put('/api/v1/verification-settings', json={'key': 'secret-test-key', 'model': 'mock/reviewer', 'effort': 'none'})
            assert configured.status_code == 200 and 'secret-test-key' not in configured.text
            response = await client.post(url, data={'message': 'proof'}, files={'files': ('proof.txt', b'evidence')})
            assert response.status_code == 201, response.text
            review = response.json()['data']
            assert review['status'] == 'waiting' and review['message'] == 'proof'
            assert (await client.get(url)).json()['data'][0]['id'] == review['id']
            downloaded = await client.get(review['attachments'][0]['url'])
            assert downloaded.status_code == 200 and downloaded.content == b'evidence'
            duplicate = await client.post(url, data={'message': 'again'}, files={'files': ('p.txt', b'proof')})
            assert duplicate.status_code == 409
            assert duplicate.json()['error']['code'] == 'review_in_progress'
            assert len(list((tmp_path / 'evidence').iterdir())) == 1
            invalid = await client.post(url, data={'message': 'bad'}, files={'files': ('bad.pdf', b'%PDF-test')})
            assert invalid.status_code == 422
            gate.set()
            result = review
            for _ in range(100):
                result = (await client.get(f"/api/v1/review-runs/{review['id']}" )).json()['data']
                if result['status'] == 'completed':
                    break
                await asyncio.sleep(.02)
            assert result['status'] == 'completed'
            assert result['verdict'] == 'inconclusive' and 'Mock reviewer' in result['reasoning']
            events = await client.get(f"/api/v1/review-runs/{review['id']}/events")
            assert 'data:' in events.text and 'completed' in events.text
            assert (await client.get('/api/v1/review-attachments/missing')).status_code == 404
    try:
        asyncio.run(run())
    finally:
        gate.set()


def test_review_timeout_marks_error(monkeypatch: object) -> None:
    import threading

    from pytest import MonkeyPatch

    from miquest import review_runs
    from miquest.api import reviews

    gate = threading.Event()
    errors: list[str] = []
    cleaned: list[str] = []
    assert isinstance(monkeypatch, MonkeyPatch)
    monkeypatch.setattr(reviews, 'REVIEW_TIMEOUT_SECONDS', 0.01)
    def worker(_factory: object, _run: str, _key: str) -> None:
        gate.wait(timeout=5)
    def fail(_db: Session, _run: str, message: str) -> None:
        errors.append(message)
    def cleanup(_factory: object, run_id: str) -> None:
        cleaned.append(run_id)
    monkeypatch.setattr(review_runs, 'execute_run', worker)
    monkeypatch.setattr(review_runs, 'fail_run', fail)
    monkeypatch.setattr(review_runs, 'cleanup_originals', cleanup)
    async def run() -> None:
        await reviews.execute_review(Session, 'run', 'key')
        gate.set()
    try:
        asyncio.run(run())
    finally:
        gate.set()
    assert errors == ['Review timed out after ten minutes.']
    assert cleaned == ['run']


def test_review_serialization_failure_rolls_back_run(tmp_path: Path, monkeypatch: object) -> None:
    import pytest
    from pytest import MonkeyPatch
    from sqlalchemy import select

    from miquest import review_runs, services
    from miquest.db import create_engine_for_path, make_session_factory
    from miquest.models import Base, ReviewRun

    engine = create_engine_for_path(tmp_path / 'database.sqlite')
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as db:
        project = services.create_project(db, 'Project')
        page = services.create_page(db, project.id, 'Page')
        quest, _ = services.create_quest(db, project.id, 'Quest', page.id, 0, 0)
        quest_id = quest.id
    app = create_app(factory, settings_path=tmp_path / 'settings.json')

    def broken_serialize(_db: Session, _run: ReviewRun) -> dict[str, object]:
        raise RuntimeError('serialization failed')

    assert isinstance(monkeypatch, MonkeyPatch)
    monkeypatch.setattr(review_runs, 'serialize_run', broken_serialize)

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            await client.put('/api/v1/verification-settings', json={'key': 'secret-test-key', 'model': 'mock/reviewer', 'effort': 'none'})
            with pytest.raises(RuntimeError, match='serialization failed'):
                await client.post(f'/api/v1/quests/{quest_id}/review-runs', data={'message': 'proof'}, files={'files': ('p.txt', b'proof')})
    asyncio.run(run())
    with factory() as db:
        assert db.scalar(select(ReviewRun.id)) is None
    assert not list((tmp_path / 'evidence').iterdir())



def test_file_limit_is_enforced_while_streaming(tmp_path: Path) -> None:
    from collections.abc import AsyncGenerator

    from miquest.evidence import MAX_FILE_BYTES

    app = create_app(Session, settings_path=tmp_path / 'settings.json')
    consumed_tail = False

    async def body() -> AsyncGenerator[bytes]:
        nonlocal consumed_tail
        yield b'--x\r\nContent-Disposition: form-data; name="files"; filename="large.txt"\r\n\r\n'
        yield b'x' * (MAX_FILE_BYTES + 1)
        consumed_tail = True
        yield b'\r\n--x--\r\n'

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            response = await client.post('/api/v1/quests/q/review-runs', content=body(), headers={'content-type': 'multipart/form-data; boundary=x'})
            assert response.status_code == 422
            assert 'size limit' in response.text
            assert not consumed_tail
    asyncio.run(run())


def test_timeout_removes_original_image_while_mock_is_blocked(tmp_path: Path, monkeypatch: object) -> None:
    import threading
    from io import BytesIO
    from typing import Any

    from PIL import Image
    from pytest import MonkeyPatch

    from miquest import openrouter, services
    from miquest.api import reviews
    from miquest.db import create_engine_for_path, make_session_factory
    from miquest.evidence import prepare_evidence
    from miquest.models import Base, ReviewRun
    from miquest.review_runs import start_run

    engine = create_engine_for_path(tmp_path / 'database.sqlite')
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    output = BytesIO()
    Image.new('RGB', (3, 2), 'red').save(output, 'PNG')
    files = prepare_evidence(tmp_path / 'evidence', [('image.png', [output.getvalue()])])
    with factory() as db:
        project = services.create_project(db, 'Project')
        page = services.create_page(db, project.id, 'Page')
        quest, _ = services.create_quest(db, project.id, 'Quest', page.id, 0, 0)
        run = start_run(db, quest.id, '', 'mock/reviewer', 'none', files)
        run_id = run.id
    gate = threading.Event()
    entered = threading.Event()
    def blocked(_request: dict[str, Any], _key: str) -> dict[str, Any]:
        entered.set()
        gate.wait(timeout=5)
        return {**mock_reviewer_response, 'id': 'gen-timeout', 'usage': {'prompt_tokens': 12, 'cost': 0.01}}
    mock_reviewer_response: dict[str, Any] = {'choices': [{'finish_reason': 'stop', 'message': {'content':
        '{"verdict":"inconclusive","reasoning":"not enough","unmetCriteria":[]}'}}]}
    assert isinstance(monkeypatch, MonkeyPatch)
    monkeypatch.setattr(openrouter, 'complete', blocked)
    monkeypatch.setattr(reviews, 'REVIEW_TIMEOUT_SECONDS', 0.5)
    async def run_review() -> None:
        try:
            await reviews.execute_review(factory, run_id, 'test-only')
            assert entered.is_set()
            assert not files[0].original_path.exists()
            assert files[0].retained_path.exists()
            with factory() as db:
                result = db.get(ReviewRun, run_id)
                assert result is not None and result.status == 'error'
        finally:
            gate.set()
    asyncio.run(run_review())
    with factory() as db:
        from miquest.review_runs import serialize_run
        result = db.get(ReviewRun, run_id)
        assert result is not None and result.status == 'error'
        assert serialize_run(db, result)['usage'] == {'generationId': 'gen-timeout', 'inputTokens': 12, 'totalCost': 0.01}


def test_real_adapter_end_to_end_with_fake_http_transport(tmp_path: Path, monkeypatch: object) -> None:
    import io
    import json
    from typing import Any
    from urllib.request import Request

    from pytest import MonkeyPatch

    from miquest import openrouter, services
    from miquest.db import create_engine_for_path, make_session_factory
    from miquest.models import Base

    engine = create_engine_for_path(tmp_path / 'database.sqlite')
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as db:
        project = services.create_project(db, 'Project')
        page = services.create_page(db, project.id, 'Page')
        quest, _ = services.create_quest(db, project.id, 'Quest', page.id, 0, 0, acceptance_criteria='criterion')
        quest_id = quest.id
    seen: list[dict[str, Any]] = []
    def fake_http(request: Request, **_kwargs: object) -> io.BytesIO:
        assert request.full_url == 'https://openrouter.ai/api/v1/chat/completions'
        assert request.get_header('Authorization') == 'Bearer test-only-key'
        assert isinstance(request.data, bytes)
        seen.append(json.loads(request.data))
        return io.BytesIO(b'{"id":"gen-test","usage":{"prompt_tokens":3,"completion_tokens":2,"cost":0.01},"choices":[{"finish_reason":"stop","message":{"content":"{\\"verdict\\":\\"pass\\",\\"reasoning\\":\\"met\\",\\"unmetCriteria\\":[]}"}}]}')
    assert isinstance(monkeypatch, MonkeyPatch)
    monkeypatch.setattr(openrouter, 'complete', real_completion_adapter)
    monkeypatch.setattr(openrouter, 'urlopen', fake_http)
    app = create_app(factory, settings_path=tmp_path / 'settings.json')
    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            await client.put('/api/v1/verification-settings', json={'key': 'test-only-key', 'model': 'mock/reviewer', 'effort': 'none'})
            response = await client.post(f'/api/v1/quests/{quest_id}/review-runs', data={'message': 'proof'}, files={'files': ('p.txt', b'evidence')})
            assert response.status_code == 201, response.text
            run_id = response.json()['data']['id']
            result: dict[str, Any] = {}
            for _ in range(100):
                result = (await client.get(f'/api/v1/review-runs/{run_id}')).json()['data']
                if result['status'] not in ('waiting', 'reviewing', 'saving'):
                    break
                await asyncio.sleep(.02)
            assert result['status'] == 'completed' and result['verdict'] == 'pass'
            assert result['usage'] == {'generationId': 'gen-test', 'inputTokens': 3, 'outputTokens': 2, 'totalCost': 0.01}
    asyncio.run(run())
    assert len(seen) == 1
    payload = seen[0]
    assert payload['model'] == 'mock/reviewer' and payload['max_tokens'] == 16384
    assert 'criterion' in payload['messages'][1]['content'][0]['text']
    assert payload['response_format']['type'] == 'json_schema'


def test_message_only_submission(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    from miquest import openrouter, services
    from miquest.db import create_engine_for_path, make_session_factory
    from miquest.models import Base

    engine = create_engine_for_path(tmp_path / 'database.sqlite')
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as db:
        project = services.create_project(db, 'Project')
        page = services.create_page(db, project.id, 'Page')
        quest, _ = services.create_quest(db, project.id, 'Quest', page.id, 0, 0)
        quest_id = quest.id
    sent: list[dict[str, Any]] = []
    def mock_complete(body: dict[str, Any], key: str) -> dict[str, Any]:
        del key
        sent.append(body)
        return {'choices': [{'finish_reason': 'stop', 'message': {'content':
            '{"verdict":"inconclusive","reasoning":"More evidence is needed.","unmetCriteria":[]}'}}]}
    monkeypatch.setattr(openrouter, 'complete', mock_complete)
    app = create_app(factory, settings_path=tmp_path / 'settings.json')
    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            await client.put('/api/v1/verification-settings', json={'key': 'test-key', 'model': 'mock/reviewer', 'effort': 'none'})
            response = await client.post(f'/api/v1/quests/{quest_id}/review-runs', files={'message': (None, 'My evidence')})
            assert response.status_code == 201, response.text
            assert response.json()['data']['attachments'] == []
            result = response.json()['data']
            for _ in range(100):
                result = (await client.get(f"/api/v1/review-runs/{response.json()['data']['id']}")).json()['data']
                if result['status'] not in ('waiting', 'reviewing', 'saving'):
                    break
                await asyncio.sleep(.02)
            assert result['status'] == 'completed'
    asyncio.run(run())
    assert len(sent) == 1
    content = sent[0]['messages'][1]['content']
    assert len(content) == 1
    assert json.loads(content[0]['text'])['message'] == 'My evidence'
