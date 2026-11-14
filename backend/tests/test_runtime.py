import json
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


def test_prefill_requires_empty_migrated_database_and_is_atomic(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from uuid import UUID

    from sqlalchemy import func, select

    from miquest import prefill
    from miquest.models import (
        Dependency,
        Page,
        Pin,
        Project,
        Quest,
        QuestAppearance,
        Verification,
    )
    from miquest.services import get_project_graph, list_pages, list_projects

    path = tmp_path / 'data.sqlite3'
    with pytest.raises(FileNotFoundError):
        prefill.prefill_database(path)
    path.touch()
    with pytest.raises(RuntimeError, match='schema'):
        prefill.prefill_database(path)
    migrate_database(path)
    original = prefill.load_fixture
    monkeypatch.setattr(prefill, 'load_fixture', lambda: {**original(), 'pins': [{'projectId': 'missing', 'questId': 'missing'}]})
    with pytest.raises(KeyError):
        prefill.prefill_database(path)
    monkeypatch.setattr(prefill, 'load_fixture', original)
    prefill.prefill_database(path)
    with make_session_factory(create_engine_for_path(path))() as session:
        assert session.scalar(select(func.count()).select_from(Project)) == 2
        assert session.scalar(select(func.count()).select_from(Quest)) == 18
        assert session.scalar(select(func.count()).select_from(Verification)) == 11
        assert session.scalar(select(func.count()).select_from(Page)) == 3
        assert session.scalar(select(func.count()).select_from(QuestAppearance)) == 19
        assert session.scalar(select(func.count()).select_from(Dependency)) == 19
        assert session.scalar(select(func.count()).select_from(Pin)) == 4
        projects = list(session.scalars(select(Project)))
        assert {p.name for p in projects} == {'Atlas', 'Studio'}
        for project in projects:
            assert str(UUID(project.id)) == project.id
        assert [p.name for p in list_projects(session)] == ['Atlas', 'Studio']
        atlas = next(p for p in projects if p.name == 'Atlas')
        assert [p.name for p in list_pages(session, atlas.id)] == ['Foundations', 'Launch path']
        graph = get_project_graph(session, atlas.id)
        assert [q['title'] for q in graph['quests'] if q['status'] == 'locked' and q['completionState'] == 'verified'] == ['Review the experience']
        review = session.scalar(select(Quest).where(Quest.title == 'Review the experience'))
        assert review is not None and review.completion_state == 'verified'
        site = session.scalar(select(Quest).where(Quest.title == 'Prepare the launch site'))
        assert site is not None
        history = list(session.scalars(select(Verification).where(Verification.quest_id == site.id).order_by(Verification.sequence)))
        assert [event.verdict for event in history] == ['pass', 'reopen']
        review_event = session.scalar(select(Verification).where(Verification.quest_id == review.id))
        assert review_event is not None
        prior = json.loads(review_event.snapshot_json)['prerequisites'][0]
        assert prior == {'questId': site.id, 'completionState': 'verified', 'latestCompletionEventId': history[0].id}
    with pytest.raises(RuntimeError, match='empty'):
        prefill.prefill_database(path)
