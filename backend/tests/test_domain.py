from collections.abc import Iterator
from pathlib import Path
from sqlite3 import Cursor

import pytest
from sqlalchemy.engine import Connection, ExecutionContext
from sqlalchemy.orm import Session

from miquest import services as s
from miquest.db import create_engine_for_path, make_session_factory
from miquest.errors import DomainError
from miquest.models import Base


@pytest.fixture
def db(tmp_path: Path) -> Iterator[Session]:
    engine = create_engine_for_path(tmp_path / 'test.sqlite3')
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as session:
        yield session


def test_graph_membership_and_verification(db: Session) -> None:
    project = s.create_project(db, name='Project')
    page = s.create_page(db, project.id, name='One')
    other = s.create_page(db, project.id, name='Two')
    a, _ = s.create_quest(db, project.id, title='A', page_id=page.id, x=0, y=0)
    b, _ = s.create_quest(db, project.id, title='B', page_id=other.id, x=0, y=0)
    s.add_dependency(db, b.id, a.id)
    with pytest.raises(DomainError, match='dependency_cycle'):
        s.add_dependency(db, a.id, b.id)
    with pytest.raises(DomainError, match='prerequisites_unsatisfied'):
        s.submit_verification(db, b.id, verdict='pass', evidence='proof', reasoning='done')
    s.submit_verification(db, a.id, verdict='pass', evidence='proof', reasoning='done')
    s.submit_verification(db, b.id, verdict='pass', evidence='proof', reasoning='done')
    s.reopen_quest(db, a.id, reason='again')
    assert not s.quest_view(db, b)['unlocked']
    assert b.completion_state == 'verified'
    s.add_quest_to_page(db, other.id, a.id, x=10, y=20)
    with pytest.raises(DomainError, match='home_page_required'):
        s.remove_quest_from_page(db, page.id, a.id)
    s.remove_quest_from_page(db, page.id, a.id, new_home_page_id=other.id)
    assert a.home_page_id == other.id


def test_pins_and_stale_revision(db: Session) -> None:
    project = s.create_project(db, name='Project')
    page = s.create_page(db, project.id, name='Page')
    a, _ = s.create_quest(db, project.id, title='A', page_id=page.id, x=0, y=0)
    b, _ = s.create_quest(db, project.id, title='B', page_id=page.id, x=0, y=0)
    s.pin_quest(db, project.id, a.id)
    s.pin_quest(db, project.id, b.id)
    s.reorder_pins(db, project.id, [b.id, a.id])
    assert [p.quest_id for p in s.list_pins(db, project.id)] == [b.id, a.id]
    with pytest.raises(DomainError, match='invalid_pin_order'):
        s.reorder_pins(db, project.id, [a.id, a.id])
    with pytest.raises(DomainError, match='stale_revision'):
        s.update_project(db, project.id, name='Stale', expected_revision=0)


def test_page_deletion_is_atomic_and_preserves_shared_quest(db: Session) -> None:
    p = s.create_project(db, name='Project')
    first = s.create_page(db, p.id, name='First')
    second = s.create_page(db, p.id, name='Second')
    a, _ = s.create_quest(db, p.id, title='A', page_id=first.id, x=0, y=0)
    b, _ = s.create_quest(db, p.id, title='B', page_id=first.id, x=0, y=0)
    s.add_quest_to_page(db, second.id, a.id, x=3, y=4)
    before = p.revision
    with pytest.raises(DomainError):
        s.delete_page(db, first.id, confirm_delete=True, quest_actions=[{'questId': a.id, 'action': 'rehome', 'targetPageId': second.id}])
    assert p.revision == before
    assert s.get_page(db, first.id)
    assert a.home_page_id == first.id
    s.delete_page(db, first.id, confirm_delete=True, quest_actions=[
        {'questId': a.id, 'action': 'rehome', 'targetPageId': second.id},
        {'questId': b.id, 'action': 'move', 'targetPageId': second.id, 'x': 8, 'y': 9},
    ])
    assert a.home_page_id == second.id and b.home_page_id == second.id


def test_verification_snapshot_and_failed_verdict_preserve_completion(db: Session) -> None:
    import json
    p = s.create_project(db, name='Project')
    page = s.create_page(db, p.id, name='Page')
    q, _ = s.create_quest(db, p.id, title='Before', page_id=page.id, x=0, y=0)
    with pytest.raises(DomainError, match='evidence_required'):
        s.submit_verification(db, q.id, verdict='pass', reasoning='reason')
    s.submit_verification(db, q.id, verdict='pass', reasoning='reason', evidence='evidence')
    s.update_quest(db, q.id, title='After')
    s.submit_verification(db, q.id, verdict='fail', reasoning='later')
    history = s.get_verification_history(db, q.id)
    assert q.completion_state == 'verified'
    assert json.loads(history['items'][0].snapshot_json)['title'] == 'Before'
    assert [v.verdict for v in history['items']] == ['pass', 'fail']


def test_project_delete_and_pin_compaction(db: Session) -> None:
    p = s.create_project(db, name='Project')
    page = s.create_page(db, p.id, name='Page')
    a, _ = s.create_quest(db, p.id, title='A', page_id=page.id, x=0, y=0)
    b, _ = s.create_quest(db, p.id, title='B', page_id=page.id, x=0, y=0)
    s.pin_quest(db, p.id, a.id)
    s.pin_quest(db, p.id, b.id)
    s.submit_verification(db, a.id, verdict='pass', reasoning='done', evidence='proof')
    s.delete_quest(db, a.id, confirm_delete=True)
    assert [(pin.quest_id, pin.sort_order) for pin in s.list_pins(db, p.id)] == [(b.id, 0)]
    s.delete_project(db, p.id, confirm_delete=True)
    assert s.list_projects(db) == []


def test_concurrent_opposing_edges_cannot_form_cycle(tmp_path: Path) -> None:
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    engine = create_engine_for_path(tmp_path / 'concurrent.sqlite3')
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as db:
        p = s.create_project(db, name='Project')
        page = s.create_page(db, p.id, name='Page')
        a, _ = s.create_quest(db, p.id, title='A', page_id=page.id, x=0, y=0)
        b, _ = s.create_quest(db, p.id, title='B', page_id=page.id, x=0, y=0)
        ids = a.id, b.id
    barrier = Barrier(2)
    def add(pair: tuple[str, str]) -> str:
        with factory() as session:
            barrier.wait()
            try:
                s.add_dependency(session, *pair)
                return 'ok'
            except DomainError as exc:
                return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(add, [ids, ids[::-1]]))
    assert sorted(results) == ['dependency_cycle', 'ok']


def test_noop_updates_do_not_advance_revision(db: Session) -> None:
    p = s.create_project(db, name='Project')
    page = s.create_page(db, p.id, name='Page')
    q, _ = s.create_quest(db, p.id, title='Quest', page_id=page.id, x=0, y=0)
    revision = p.revision
    s.update_project(db, p.id, name=' Project ')
    s.update_page(db, page.id, name='Page')
    s.update_quest(db, q.id, title='Quest')
    assert p.revision == revision


def test_timestamps_use_utc_z(db: Session) -> None:
    p = s.create_project(db, name='Project')
    assert p.created_at.endswith('Z') and p.updated_at.endswith('Z')


def test_mutation_does_not_discard_pending_session_changes(db: Session) -> None:
    p = s.create_project(db, name='Project')
    p.description = 'unsaved'
    with pytest.raises(RuntimeError):
        s.create_page(db, p.id, name='Page')
    assert p.description == 'unsaved'
    assert p in db.dirty


def test_graph_read_uses_one_sqlite_snapshot(tmp_path: Path) -> None:
    from sqlalchemy import event
    engine = create_engine_for_path(tmp_path / 'snapshot.sqlite3')
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as setup:
        p = s.create_project(setup, name='Project')
        page = s.create_page(setup, p.id, name='Page')
        pid, page_id, revision = p.id, page.id, p.revision
    fired = False
    def insert_during_read(conn: Connection, cursor: Cursor, statement: str, parameters: object, context: ExecutionContext | None, executemany: bool) -> None:
        nonlocal fired
        if not fired and 'FROM pages' in statement:
            fired = True
            with factory() as writer:
                s.create_quest(writer, pid, title='New', page_id=page_id, x=0, y=0)
    event.listen(engine, 'before_cursor_execute', insert_during_read)
    try:
        with factory() as reader:
            graph = s.get_project_graph(reader, pid)
            assert graph['project'].revision == revision
            assert graph['quests'] == []
    finally:
        event.remove(engine, 'before_cursor_execute', insert_during_read)


def test_verification_transitions_and_pagination(db: Session) -> None:
    p = s.create_project(db, name='Project')
    page = s.create_page(db, p.id, name='Page')
    a, _ = s.create_quest(db, p.id, title='A', page_id=page.id, x=0, y=0)
    b, _ = s.create_quest(db, p.id, title='B', page_id=page.id, x=0, y=0, work_state='blocked')
    s.add_dependency(db, b.id, a.id)
    with pytest.raises(DomainError, match='confirmation_required'):
        s.override_quest(db, b.id, reason='manual')
    s.override_quest(db, b.id, reason='manual', confirm_override=True)
    s.submit_verification(db, b.id, verdict='inconclusive', reasoning='uncertain')
    assert b.completion_state == 'overridden' and b.work_state == 'blocked'
    with pytest.raises(DomainError, match='prerequisites_unsatisfied'):
        s.submit_verification(db, b.id, verdict='pass', evidence='proof', reasoning='done')
    s.submit_verification(db, a.id, verdict='pass', evidence='proof', reasoning='done')
    s.submit_verification(db, b.id, verdict='pass', evidence='proof', reasoning='done')
    assert b.completion_state == 'verified' and b.work_state == 'blocked'
    s.reopen_quest(db, b.id, reason='retry')
    assert b.completion_state == 'none' and b.work_state == 'not_started'
    with pytest.raises(DomainError, match='invalid_input'):
        s.reopen_quest(db, b.id, reason='again')
    first = s.get_verification_history(db, b.id, limit=2)
    second = s.get_verification_history(db, b.id, after_sequence=first['nextAfterSequence'], limit=2)
    assert [v.verdict for v in first['items'] + second['items']] == ['override', 'inconclusive', 'pass', 'reopen']
    assert second['nextAfterSequence'] is None


def test_page_delete_rejects_invalid_plans_without_changes(db: Session) -> None:
    p = s.create_project(db, name='Project')
    page = s.create_page(db, p.id, name='Page')
    target = s.create_page(db, p.id, name='Target')
    q, _ = s.create_quest(db, p.id, title='Quest', page_id=page.id, x=0, y=0)
    action = {'questId': q.id, 'action': 'move', 'targetPageId': target.id, 'x': 1, 'y': 2}
    revision = p.revision
    for actions in ([action, action], [{'questId': q.id, 'action': 'rehome', 'targetPageId': target.id}], [{'questId': q.id, 'action': 'delete'}]):
        with pytest.raises(DomainError):
            s.delete_page(db, page.id, confirm_delete=True, quest_actions=actions)
        assert p.revision == revision
        assert s.get_page(db, page.id) and q.home_page_id == page.id


def test_removing_multiple_quests_compacts_pins(db: Session) -> None:
    p = s.create_project(db, name='Project')
    page = s.create_page(db, p.id, name='Page')
    target = s.create_page(db, p.id, name='Target')
    a, _ = s.create_quest(db, p.id, title='A', page_id=page.id, x=0, y=0)
    b, _ = s.create_quest(db, p.id, title='B', page_id=page.id, x=0, y=0)
    c, _ = s.create_quest(db, p.id, title='C', page_id=target.id, x=0, y=0)
    for q in (a, b, c): s.pin_quest(db, p.id, q.id)
    s.delete_page(db, page.id, confirm_delete=True, quest_actions=[
        {'questId': a.id, 'action': 'delete', 'confirmDelete': True},
        {'questId': b.id, 'action': 'delete', 'confirmDelete': True},
    ])
    assert [(pin.quest_id, pin.sort_order) for pin in s.list_pins(db, p.id)] == [(c.id, 0)]


def test_confirmation_requires_explicit_true(db: Session) -> None:
    p = s.create_project(db, name='Project')
    page = s.create_page(db, p.id, name='Page')
    q, _ = s.create_quest(db, p.id, title='Quest', page_id=page.id, x=0, y=0)
    with pytest.raises(DomainError, match='confirmation_required'):
        s.delete_page(db, page.id, confirm_delete=True, quest_actions=[{'questId': q.id, 'action': 'delete', 'confirmDelete': 'yes'}])
    assert s.get_quest(db, q.id)['quest']['title'] == 'Quest'


def test_reused_sessions_refresh_between_transactions(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'reuse.sqlite3')
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as first, factory() as second:
        p = s.create_project(first, name='Project')
        page = s.create_page(first, p.id, name='Page')
        q, _ = s.create_quest(first, p.id, title='Old', page_id=page.id, x=0, y=0)
        old_revision = p.revision
        s.update_quest(second, q.id, title='New')
        with pytest.raises(DomainError, match='stale_revision'):
            s.update_project(first, p.id, description='Stale', expected_revision=old_revision)
        graph = s.get_project_graph(first, p.id)
        assert graph['quests'][0]['title'] == 'New'
        assert graph['project'].revision == old_revision + 1


def test_rehome_action_changes_surviving_home(db: Session) -> None:
    p = s.create_project(db, name='Project')
    first = s.create_page(db, p.id, name='First')
    second = s.create_page(db, p.id, name='Second')
    third = s.create_page(db, p.id, name='Third')
    q, _ = s.create_quest(db, p.id, title='Quest', page_id=first.id, x=0, y=0)
    s.add_quest_to_page(db, second.id, q.id, x=0, y=0)
    s.add_quest_to_page(db, third.id, q.id, x=0, y=0)
    s.delete_page(db, second.id, confirm_delete=True, quest_actions=[
        {'questId': q.id, 'action': 'rehome', 'targetPageId': third.id},
    ])
    assert q.home_page_id == third.id


def test_graph_refreshes_reused_session_identity_map(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'reuse_read.sqlite3')
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as first, factory() as second:
        p = s.create_project(first, name='Project')
        page = s.create_page(first, p.id, name='Page')
        q, _ = s.create_quest(first, p.id, title='Old', page_id=page.id, x=0, y=0)
        old_revision = p.revision
        s.update_quest(second, q.id, title='New')
        graph = s.get_project_graph(first, p.id)
        assert graph['quests'][0]['title'] == 'New'
        assert graph['project'].revision == old_revision + 1


def test_timestamp_retains_zero_microseconds(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import UTC, datetime

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz: object = None) -> 'FixedDatetime':
            return cls(2026, 1, 2, tzinfo=UTC)

    monkeypatch.setattr(s, 'datetime', FixedDatetime)
    assert s.now() == '2026-01-02T00:00:00.000000Z'
