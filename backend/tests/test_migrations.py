from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import CursorResult, inspect, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import IntegrityError

from miquest.db import check_schema, create_engine_for_path, make_session_factory


def migrate(engine: Engine) -> None:
    config = Config()
    config.set_main_option("script_location", "miquest:migrations")
    with engine.connect() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def sql(connection: Connection, statement: str, **parameters: str) -> CursorResult[Any]:
    return connection.execute(text(statement), parameters)


def seed(connection: Connection) -> None:
    for project in ("p1", "p2"):
        sql(connection, "INSERT INTO projects (id,name,created_at,updated_at) VALUES (:id,:id,'now','now')", id=project)
        sql(connection, "INSERT INTO pages (id,project_id,name,created_at,updated_at) VALUES (:page,:project,:page,'now','now')", page=project + "page", project=project)
        sql(connection, "INSERT INTO quests (id,project_id,title,icon_name,home_page_id,created_at,updated_at) VALUES (:quest,:project,:quest,'compass',:page,'now','now')", quest=project + "quest", project=project, page=project + "page")
        sql(connection, "INSERT INTO quest_appearances VALUES (:page,:quest,:project,0,0)", page=project + "page", quest=project + "quest", project=project)


def test_upgrade_persistence_and_constraints(tmp_path: Path) -> None:
    path = tmp_path / "db.sqlite"
    engine = create_engine_for_path(path)
    with make_session_factory(engine)() as session:
        assert not check_schema(session)
    migrate(engine)
    with make_session_factory(engine)() as session:
        assert check_schema(session)
    with engine.begin() as connection:
        assert sql(connection, "PRAGMA foreign_keys").scalar_one() == 1
        assert sql(connection, "PRAGMA journal_mode").scalar_one() == "wal"
        seed(connection)
    engine.dispose()
    engine = create_engine_for_path(path)
    migrate(engine)
    with engine.begin() as connection:
        assert sql(connection, "SELECT count(*) FROM quests").scalar_one() == 2
        assert sql(connection, "PRAGMA foreign_key_check").all() == []
        with pytest.raises(IntegrityError):
            sql(connection, "INSERT INTO dependencies VALUES ('p1quest','p2quest','p1')")
        with pytest.raises(IntegrityError):
            sql(connection, "INSERT INTO quest_appearances VALUES ('p1page','p2quest','p1',0,0)")
        with pytest.raises(IntegrityError):
            sql(connection, "INSERT INTO pins VALUES ('p1','p2quest',0)")


def test_home_appearance_is_deferred_until_commit(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / "db.sqlite")
    migrate(engine)
    with engine.begin() as connection:
        seed(connection)
    with pytest.raises(IntegrityError), engine.begin() as connection:
        sql(connection, "DELETE FROM quest_appearances WHERE quest_id='p1quest'")
    with engine.begin() as connection:
        assert sql(connection, "SELECT count(*) FROM quest_appearances WHERE quest_id='p1quest'").scalar_one() == 1


def test_verification_immutable_and_project_deletion(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / "db.sqlite")
    migrate(engine)
    with engine.begin() as connection:
        seed(connection)
        sql(connection, "INSERT INTO verifications VALUES ('v','p1quest',1,'pass','agent','evidence','reason','{}','now')")
        with pytest.raises(IntegrityError):
            sql(connection, "UPDATE verifications SET reasoning='changed' WHERE id='v'")
        sql(connection, "DELETE FROM quests WHERE project_id='p1'")
        sql(connection, "DELETE FROM pages WHERE project_id='p1'")
        sql(connection, "DELETE FROM projects WHERE id='p1'")
        assert sql(connection, "SELECT count(*) FROM verifications").scalar_one() == 0


def test_schema_revision_compatibility(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / "db.sqlite")
    with make_session_factory(engine)() as session:
        assert not check_schema(session)
    migrate(engine)
    with engine.begin() as connection:
        sql(connection, "DELETE FROM alembic_version")
    with make_session_factory(engine)() as session:
        assert not check_schema(session)
    with engine.begin() as connection:
        sql(connection, "INSERT INTO alembic_version VALUES ('future_revision')")
    with make_session_factory(engine)() as session:
        assert not check_schema(session)


def test_failed_transaction_rolls_back_all_changes(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / "db.sqlite")
    migrate(engine)
    with pytest.raises(IntegrityError), engine.begin() as connection:
        seed(connection)
        sql(connection, "DELETE FROM quest_appearances WHERE quest_id='p1quest'")
    with engine.connect() as connection:
        assert sql(connection, "SELECT count(*) FROM projects").scalar_one() == 0
        assert sql(connection, "SELECT count(*) FROM quests").scalar_one() == 0
        assert sql(connection, "PRAGMA foreign_key_check").all() == []


@pytest.mark.parametrize(("verdict", "actor", "evidence", "reasoning"), [
    ("pass", "human", "evidence", "reason"),
    ("pass", "agent", " ", "reason"),
    ("override", "agent", "", "reason"),
    ("fail", "human", "", "reason"),
    ("inconclusive", "human", "", "reason"),
    ("reopen", "human", "", " "),
    ("unknown", "agent", "", "reason"),
])
def test_verification_checks(tmp_path: Path, verdict: str, actor: str, evidence: str, reasoning: str) -> None:
    engine = create_engine_for_path(tmp_path / "db.sqlite")
    migrate(engine)
    with engine.begin() as connection:
        seed(connection)
    with pytest.raises(IntegrityError), engine.begin() as connection:
        sql(connection, "INSERT INTO verifications VALUES ('v','p1quest',1,:verdict,:actor,:evidence,:reasoning,'{}','now')", verdict=verdict, actor=actor, evidence=evidence, reasoning=reasoning)
    with engine.connect() as connection:
        assert sql(connection, "SELECT count(*) FROM verifications").scalar_one() == 0


def test_migration_matches_model_metadata(tmp_path: Path) -> None:
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    from miquest.models import Base

    engine = create_engine_for_path(tmp_path / "db.sqlite")
    migrate(engine)
    model_engine = create_engine_for_path(tmp_path / "models.sqlite")
    Base.metadata.create_all(model_engine)
    with engine.connect() as connection, pytest.warns(Warning, match="Cannot correctly sort tables"):
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    migrated = inspect(engine)
    modeled = inspect(model_engine)
    for table in Base.metadata.tables:
        assert sorted(map(str, migrated.get_foreign_keys(table))) == sorted(map(str, modeled.get_foreign_keys(table)))
        assert sorted(" ".join(item["sqltext"].split()) for item in migrated.get_check_constraints(table)) == sorted(" ".join(item["sqltext"].split()) for item in modeled.get_check_constraints(table))
        assert sorted(map(str, migrated.get_unique_constraints(table))) == sorted(map(str, modeled.get_unique_constraints(table)))


def test_failed_upgrade_rolls_back_ddl(tmp_path: Path) -> None:
    from sqlalchemy.exc import OperationalError

    engine = create_engine_for_path(tmp_path / "db.sqlite")
    with engine.begin() as connection:
        sql(connection, "CREATE TABLE pages (id TEXT)")
        sql(connection, "INSERT INTO pages VALUES ('preserved')")
    with pytest.raises(OperationalError):
        migrate(engine)
    assert inspect(engine).get_table_names() == ["pages"]
    with engine.connect() as connection:
        assert sql(connection, "SELECT id FROM pages").scalar_one() == "preserved"


def test_populated_downgrade_and_failure_rollback(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / "db.sqlite")
    migrate(engine)
    with engine.begin() as connection:
        seed(connection)
        sql(connection, "INSERT INTO verifications VALUES ('v','p1quest',1,'pass','agent','evidence','reason','{}','now')")
        sql(connection, "CREATE TRIGGER prevent_quest_delete BEFORE DELETE ON quests BEGIN SELECT RAISE(ABORT, 'blocked'); END")
    config = Config()
    config.set_main_option("script_location", "miquest:migrations")
    with pytest.raises(IntegrityError), engine.connect() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    with engine.begin() as connection:
        assert sql(connection, "SELECT count(*) FROM verifications").scalar_one() == 1
        assert sql(connection, "SELECT count(*) FROM quests").scalar_one() == 2
        assert sql(connection, "SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name='verification_no_update'").scalar_one() == 1
        sql(connection, "DROP TRIGGER prevent_quest_delete")
    with engine.connect() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    assert inspect(engine).get_table_names() == ["alembic_version"]


def test_schema_check_uses_current_migration_heads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from alembic.script import ScriptDirectory

    engine = create_engine_for_path(tmp_path / "db.sqlite")
    migrate(engine)
    def future_heads(_script: ScriptDirectory) -> list[str]:
        return ["future_revision"]

    monkeypatch.setattr(ScriptDirectory, "get_heads", future_heads)
    with make_session_factory(engine)() as session:
        assert not check_schema(session)
    with engine.begin() as connection:
        sql(connection, "UPDATE alembic_version SET version_num='future_revision'")
    with make_session_factory(engine)() as session:
        assert check_schema(session)
