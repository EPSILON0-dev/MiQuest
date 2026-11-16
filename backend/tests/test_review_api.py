import asyncio
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from miquest.api import create_app


def test_review_model_catalog_and_upload_limit(tmp_path: Path) -> None:
    app = create_app(Session, allowed_hosts=('testserver',), settings_path=tmp_path / 'settings.json')

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
    app = create_app(factory, allowed_hosts=('testserver',), settings_path=tmp_path / 'settings.json')

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
    assert isinstance(monkeypatch, MonkeyPatch)
    monkeypatch.setattr(reviews, 'REVIEW_TIMEOUT_SECONDS', 0.01)
    def worker(_factory: object, _run: str, _key: str) -> None:
        gate.wait(timeout=5)
    def fail(_db: Session, _run: str, message: str) -> None:
        errors.append(message)
    monkeypatch.setattr(review_runs, 'execute_run', worker)
    monkeypatch.setattr(review_runs, 'fail_run', fail)
    async def run() -> None:
        await reviews.execute_review(Session, 'run', 'key')
        gate.set()
    try:
        asyncio.run(run())
    finally:
        gate.set()
    assert errors == ['Review timed out after ten minutes.']



def test_file_limit_is_enforced_while_streaming(tmp_path: Path) -> None:
    from collections.abc import AsyncGenerator

    from miquest.evidence import MAX_FILE_BYTES

    app = create_app(Session, allowed_hosts=('testserver',), settings_path=tmp_path / 'settings.json')
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
