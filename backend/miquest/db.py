from pathlib import Path
from sqlite3 import Connection as SQLiteConnection

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import URL, create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import ConnectionPoolEntry


def create_engine_for_path(path: str | Path) -> Engine:
    engine = create_engine(URL.create("sqlite", database=str(path)))

    @event.listens_for(engine, "connect")
    def configure(dbapi_connection: SQLiteConnection, _connection_record: ConnectionPoolEntry) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def check_schema(session: Session) -> bool:
    connection = session.connection()
    if not inspect(connection).has_table("alembic_version"):
        return False
    config = Config()
    config.set_main_option("script_location", "miquest:migrations")
    heads = ScriptDirectory.from_config(config).get_heads()
    versions = connection.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    return bool(heads) and set(versions) == set(heads)
