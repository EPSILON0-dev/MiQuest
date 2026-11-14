import json
import logging
from collections.abc import Awaitable, Callable
from importlib.resources import files
from typing import cast
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def error(code: str, message: str, status: int, details: dict[str, object] | None = None, **extra: object) -> JSONResponse:
    payload: dict[str, object] = {'error': {'code': code, 'message': message}}
    if details:
        payload['error'] = {'code': code, 'message': message, 'details': details}
    payload.update(extra)
    return JSONResponse(payload, status_code=status, headers={'Retry-After': '1'} if code == 'database_busy' else None)


def create_app(session_factory: Callable[[], Session], allowed_hosts: tuple[str, ...] = ('localhost', '127.0.0.1')) -> FastAPI:
    app = FastAPI()
    app.state.session_factory = session_factory
    allowed = set(allowed_hosts)

    @app.middleware('http')
    async def boundary(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        host = request.headers.get('host', '')
        try:
            authority = urlsplit(f'//{host}')
            hostname = authority.hostname if not authority.username and not authority.password and not authority.path else None
            _port = authority.port
        except ValueError:
            hostname = None
        if hostname not in allowed:
            return error('invalid_input', 'Invalid host.', 400)
        if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
            origin = request.headers.get('origin')
            if origin:
                try:
                    parsed = urlsplit(origin)
                    valid_origin = parsed.scheme == request.url.scheme and parsed.netloc.lower() == host.lower() and not parsed.path and not parsed.query and not parsed.fragment
                except ValueError:
                    valid_origin = False
                if not valid_origin:
                    return error('invalid_input', 'Origin is not allowed.', 403)
            if request.url.path.startswith('/api/') and request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'application/json':
                return error('invalid_input', 'Content-Type must be application/json.', 415)
        return await call_next(request)

    from miquest.errors import DomainError

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, exc: DomainError) -> JSONResponse:
        not_found = {'project_not_found', 'page_not_found', 'quest_not_found', 'appearance_not_found'}
        conflict = {'dependency_exists', 'dependency_cycle', 'quest_would_be_orphaned', 'home_page_required', 'prerequisites_unsatisfied', 'stale_revision'}
        if exc.code == 'internal_error':
            return error('internal_error', 'Internal server error.', 500, requestId=str(uuid4()))
        status = 404 if exc.code in not_found else 409 if exc.code in conflict else 503 if exc.code == 'database_busy' else 422
        return error(exc.code, exc.message, status, exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = ['.'.join(str(part) for part in item['loc']) for item in exc.errors()]
        return error('invalid_input', 'Invalid request.', 422, {'fields': fields})

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        request_id = str(uuid4())
        logger.error('Unexpected API error %s', request_id)
        return error('internal_error', 'Internal server error.', 500, requestId=request_id)

    @app.get('/healthz')
    def health() -> dict[str, str]:
        return {'status': 'ok'}

    @app.get('/readyz', response_model=None)
    def ready() -> dict[str, str] | JSONResponse:
        try:
            from miquest.db import check_schema
            with session_factory() as session:
                if not check_schema(session):
                    raise ValueError("Incompatible schema")
            return {'status': 'ok'}
        except Exception:  # noqa: BLE001
            return JSONResponse({'status': 'unavailable'}, status_code=503)

    from .routes import router
    app.include_router(router, prefix='/api/v1')
    schema = cast(dict[str, object], json.loads(files('miquest.api').joinpath('openapi.json').read_text(encoding='utf-8')))
    app.openapi = lambda: schema
    return app
