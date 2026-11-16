"""Explicit database initialization and application startup."""

import argparse
import fcntl
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy import select

from .api import create_app
from .db import check_schema, create_engine_for_path, make_session_factory


def migrate_database(path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine_for_path(path)
    config = Config()
    config.set_main_option('script_location', 'miquest:migrations')
    with engine.connect() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
    engine.dispose()


def build_app(path: Path, allowed_hosts: tuple[str, ...] = ('localhost', '127.0.0.1', 'testserver')) -> FastAPI:
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError('Database does not exist; initialize it explicitly before serving.')
    engine = create_engine_for_path(path)
    session_factory = make_session_factory(engine)
    with session_factory() as session:
        if not check_schema(session):
            engine.dispose()
            raise RuntimeError('Database schema is incompatible; run migrations before serving.')
    app = create_app(session_factory, allowed_hosts=allowed_hosts, settings_path=path.parent / 'verification-settings.json')

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
        from .models import ReviewAttachment
        from .review_runs import interrupt_runs

        with (path.parent / '.miquest-server.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError('Another MiQuest server is using this data directory.') from None
            with session_factory() as session:
                interrupt_runs(session)
                attachments = list(session.scalars(select(ReviewAttachment)))
                from .review_runs import evidence_path
                retained = {evidence_path(session, item.retained_path).resolve() for item in attachments}
                for item in attachments:
                    item.original_path = None
                session.commit()
            evidence = path.parent / 'evidence'
            if evidence.exists():
                for item in evidence.glob('evidence-*'):
                    if item.resolve() not in retained and item.is_file():
                        item.unlink(missing_ok=True)
            yield
            fcntl.flock(lock, fcntl.LOCK_UN)

    app.router.lifespan_context = lifespan
    return app


def main() -> None:
    parser = argparse.ArgumentParser(description='Run the MiQuest backend')
    parser.add_argument('action', choices=['migrate', 'prefill', 'serve'])
    parser.add_argument('--database', type=Path, default=Path('./data/miquest.sqlite3'))
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--allowed-host', action='append', dest='allowed_hosts')
    args = parser.parse_args()
    if args.action == 'migrate':
        migrate_database(args.database)
    elif args.action == 'prefill':
        from .prefill import prefill_database
        prefill_database(args.database)
    else:
        import uvicorn
        uvicorn.run(build_app(args.database, tuple(args.allowed_hosts or ('localhost', '127.0.0.1'))), host=args.host, port=args.port, proxy_headers=True, forwarded_allow_ips='127.0.0.1,::1')


if __name__ == '__main__':
    main()
