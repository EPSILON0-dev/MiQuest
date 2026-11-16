"""Review request and status endpoints."""

import asyncio
import json
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from pathlib import Path
from typing import cast

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from miquest import review_runs, services
from miquest.errors import DomainError
from miquest.evidence import MAX_FILE_BYTES, MAX_TOTAL_BYTES, prepare_evidence
from miquest.models import ReviewRun
from miquest.verification_settings import load_settings

router = APIRouter()
REVIEW_TIMEOUT_SECONDS = 600
MODELS = [{'id': 'mock/reviewer', 'name': 'Mock reviewer (no OpenRouter request)', 'contextLength': 131072,
           'efforts': ['none', 'low', 'medium', 'high']}]


class LimitedMultipartParser(MultiPartParser):
    def on_part_begin(self) -> None:
        super().on_part_begin()
        self.file_bytes = 0

    def on_part_data(self, data: bytes, start: int, end: int) -> None:
        if self._current_part.file is not None:
            self.file_bytes += end - start
            if self.file_bytes > MAX_FILE_BYTES:
                raise MultiPartException('Attachment size limit exceeded')
        super().on_part_data(data, start, end)


@router.get('/verification-models')
def models() -> dict[str, object]:
    return {'data': MODELS}


async def execute_review(factory: Callable[[], Session], run_id: str, key: str) -> None:
    try:
        await asyncio.wait_for(asyncio.to_thread(review_runs.execute_run, factory, run_id, key), REVIEW_TIMEOUT_SECONDS)
    except TimeoutError:
        with factory() as db:
            review_runs.fail_run(db, run_id, 'Review timed out after ten minutes.')
    except Exception:  # noqa: BLE001
        with factory() as db:
            review_runs.fail_run(db, run_id, 'The mock reviewer could not finish the review.')


@router.post('/quests/{questId}/review-runs', status_code=201)
async def create_review(request: Request, questId: str) -> dict[str, object]:
    async def limited() -> AsyncGenerator[bytes]:
        total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > MAX_TOTAL_BYTES + 1024 * 1024:
                raise MultiPartException('Request too large')
            yield chunk

    try:
        form = await LimitedMultipartParser(request.headers, limited(), max_files=5, max_fields=1, max_part_size=100000).parse()
    except MultiPartException as exc:
        if str(exc) == 'Request too large':
            from fastapi import HTTPException
            raise HTTPException(status_code=413, detail='Request too large') from None
        raise DomainError('invalid_input', str(exc)) from None
    try:
        if any(key not in {'message', 'files'} for key, _ in form.multi_items()):
            raise DomainError('invalid_input')
        message = form.get('message', '')
        uploads = form.getlist('files')
        if not isinstance(message, str) or any(not isinstance(item, UploadFile) for item in uploads):
            raise DomainError('invalid_input')
        settings = load_settings(request.app.state.settings_path)
        if not settings['key'] or settings['model'] != MODELS[0]['id'] or settings['effort'] not in ('none', 'low', 'medium', 'high'):
            raise DomainError('invalid_input', 'Configure a compatible model, effort and key before review.')
        files = cast(list[UploadFile], uploads)
        try:
            preparation = asyncio.create_task(asyncio.to_thread(
                prepare_evidence, Path(request.app.state.settings_path).parent / 'evidence',
                ((file.filename or 'attachment', iter(lambda file=file: file.file.read(65536), b'')) for file in files)))
            try:
                prepared = await asyncio.shield(preparation)
            except asyncio.CancelledError:
                prepared = await preparation
                for item in prepared:
                    item.original_path.unlink(missing_ok=True)
                    item.retained_path.unlink(missing_ok=True)
                raise
        except ValueError as exc:
            raise DomainError('invalid_input', str(exc)) from None
        factory = cast(Callable[[], Session], request.app.state.session_factory)
        try:
            with factory() as db:
                run = review_runs.start_run(db, questId, message, settings['model'], settings['effort'], attachments=prepared)
                result = review_runs.serialize_run(db, run)
        except BaseException:
            for item in prepared:
                item.original_path.unlink(missing_ok=True)
                item.retained_path.unlink(missing_ok=True)
            raise
        asyncio.create_task(execute_review(factory, run.id, settings['key']))
        return {'data': result}
    finally:
        await form.close()


@router.get('/quests/{questId}/review-runs')
def list_reviews(request: Request, questId: str) -> dict[str, object]:
    from miquest.models import Quest
    factory = cast(Callable[[], Session], request.app.state.session_factory)
    with factory() as db:
        services.get(db, Quest, questId, 'quest_not_found')
        runs = db.scalars(select(ReviewRun).where(ReviewRun.quest_id == questId).order_by(ReviewRun.created_at.desc(), ReviewRun.id.desc())).all()
        return {'data': [review_runs.serialize_run(db, run) for run in runs]}


@router.get('/review-runs/{runId}')
def get_review(request: Request, runId: str) -> dict[str, object]:
    factory = cast(Callable[[], Session], request.app.state.session_factory)
    with factory() as db:
        return {'data': review_runs.serialize_run(db, services.get(db, ReviewRun, runId, 'review_run_not_found'))}


@router.get('/review-runs/{runId}/events')
async def review_events(request: Request, runId: str) -> StreamingResponse:
    get_review(request, runId)
    async def events() -> AsyncIterator[str]:
        last = ''
        idle = 0
        while not await request.is_disconnected():
            try:
                data = get_review(request, runId)['data']
            except DomainError as exc:
                if exc.code == 'review_run_not_found':
                    break
                raise
            payload = json.dumps(data)
            if payload != last:
                yield f'data: {payload}\n\n'
                last = payload
                idle = 0
            else:
                idle += 1
                if idle >= 15:
                    yield ': keepalive\n\n'
                    idle = 0
            if cast(dict[str, object], data)['status'] not in review_runs.ACTIVE:
                break
            await asyncio.sleep(1)
    return StreamingResponse(events(), media_type='text/event-stream', headers={'Cache-Control': 'no-store'})


@router.get('/review-attachments/{attachmentId}')
def attachment(request: Request, attachmentId: str) -> FileResponse:
    factory = cast(Callable[[], Session], request.app.state.session_factory)
    with factory() as db:
        path, name, media = review_runs.attachment_path(db, attachmentId, Path(request.app.state.settings_path).parent / 'evidence')
        return FileResponse(path, filename=name, media_type=media, headers={'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'})
