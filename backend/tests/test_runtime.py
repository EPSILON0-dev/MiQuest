from pathlib import Path

import pytest

from miquest.db import check_schema, create_engine_for_path, make_session_factory
from miquest.runtime import build_app, migrate_database


def test_database_must_be_explicitly_initialized(tmp_path: Path) -> None:
    path = tmp_path / 'miquest.sqlite3'
    with pytest.raises(FileNotFoundError):
        build_app(path)
    assert not path.exists()
    migrate_database(path)
    app = build_app(path)
    assert app is not None
    with make_session_factory(create_engine_for_path(path))() as session:
        assert check_schema(session)
    assert path.exists()


def test_database_migration_works_from_other_working_directory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    path = Path('data/miquest.sqlite3')
    migrate_database(path)
    assert path.exists()


def test_serving_an_unmigrated_database_fails(tmp_path: Path) -> None:
    path = tmp_path / 'existing.sqlite3'
    path.touch()
    with pytest.raises(RuntimeError, match='schema'):
        build_app(path)
