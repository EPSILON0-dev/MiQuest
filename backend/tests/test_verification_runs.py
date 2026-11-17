import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from miquest import services as s
from miquest.db import create_engine_for_path, make_session_factory
from miquest.errors import DomainError
from miquest.models import Base
from miquest.review_runs import finish_run, start_run


@pytest.fixture
def db(tmp_path: Path) -> Iterator[Session]:
    engine = create_engine_for_path(tmp_path / 'test.sqlite3')
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as session:
        yield session


def test_run_locks_mutations_and_preserves_prerequisite_race(db: Session) -> None:
    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    a, _ = s.create_quest(db, p.id, 'prerequisite', page.id, 0, 0)
    q, _ = s.create_quest(db, p.id, 'reviewed', page.id, 0, 0)
    s.add_dependency(db, q.id, a.id)
    s.override_quest(db, a.id, 'done', True)
    run = start_run(db, q.id, 'proof', 'mock/model', '')
    assert json.loads(run.snapshot_json)['title'] == 'reviewed'
    for operation in (
        lambda: start_run(db, q.id, 'again', 'mock/model', ''),
        lambda: s.update_quest(db, q.id, title='changed'),
        lambda: s.remove_dependency(db, q.id, a.id),
        lambda: s.delete_quest(db, a.id, True),
        lambda: s.delete_project(db, p.id, True),
        lambda: s.override_quest(db, q.id, 'override', True),
    ):
        with pytest.raises(DomainError, match='review_in_progress'):
            operation()
    s.reopen_quest(db, a.id, 'changed')
    finished = finish_run(db, run.id, 'pass', 'Looks good', [])
    assert finished.status == 'completed'
    assert finished.verdict == 'pass'
    assert finished.completion_applied == 0
    assert q.completion_state == 'none'
    s.update_quest(db, q.id, title='unlocked')


def test_invalid_verdict_does_not_complete_quest(db: Session) -> None:
    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    run = start_run(db, q.id, 'proof', 'mock/model', '')
    with pytest.raises(DomainError):
        finish_run(db, run.id, 'invalid', '', [])
    assert q.completion_state == 'none'


def test_failed_and_interrupted_runs_release_lock(db: Session) -> None:
    from miquest.review_runs import fail_run, interrupt_runs

    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    run = start_run(db, q.id, 'proof', 'mock/model', '')
    fail_run(db, run.id, 'Reviewer failed')
    assert run.status == 'error'
    next_run = start_run(db, q.id, 'retry', 'mock/model', '')
    interrupt_runs(db)
    assert next_run.status == 'interrupted'
    s.update_quest(db, q.id, title='editable')


def test_deleting_quest_removes_evidence_only_after_commit(db: Session, tmp_path: Path) -> None:
    from miquest.evidence import prepare_evidence
    from miquest.review_runs import fail_run

    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    evidence = prepare_evidence(tmp_path / 'evidence', [('proof.txt', [b'proof'])])
    path = evidence[0].retained_path
    run = start_run(db, q.id, '', 'mock/model', '', evidence)
    with pytest.raises(DomainError):
        s.delete_quest(db, q.id, True)
    assert path.exists()
    fail_run(db, run.id, 'failed')
    s.delete_quest(db, q.id, True)
    assert not path.exists()


def test_valid_pass_records_history_and_completion(db: Session) -> None:
    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    run = start_run(db, q.id, 'proof', 'mock/model', '')
    finish_run(db, run.id, 'pass', 'all criteria met', [])
    assert q.completion_state == 'verified'
    assert run.completion_applied == 1
    assert s.get_verification_history(db, q.id)['items'][0].verdict == 'pass'


def test_context_overflow_blocks_without_starting_run(db: Session) -> None:
    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0, description='x' * 100000)
    with pytest.raises(DomainError, match='context_overflow'):
        start_run(db, q.id, 'y' * 20000, 'mock/reviewer', 'none')
    s.update_quest(db, q.id, title='still unlocked')


def test_previous_external_verdict_is_included(db: Session) -> None:
    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    s.submit_verification(db, q.id, 'fail', 'missing proof')
    run = start_run(db, q.id, 'new proof', 'mock/reviewer', 'none')
    assert json.loads(run.snapshot_json)['previous'] == {'verdict': 'fail', 'reasoning': 'missing proof'}


def test_review_lock_covers_bulk_and_external_mutations_but_not_layout(db: Session) -> None:
    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    other, _ = s.create_quest(db, p.id, 'other', page.id, 0, 0)
    start_run(db, q.id, 'proof', 'mock/reviewer', 'none')
    for operation in (
        lambda: s.add_dependency(db, q.id, other.id),
        lambda: s.submit_verification(db, q.id, 'fail', 'not done'),
        lambda: s.reopen_quest(db, q.id, 'again'),
        lambda: s.delete_page(db, page.id, True, [{'questId': q.id, 'action': 'delete', 'confirmDelete': True}, {'questId': other.id, 'action': 'delete', 'confirmDelete': True}]),
        lambda: s.save_tree_draft(db, p.id, p.revision, [{'operation': 'update_quest', 'arguments': {'questId': q.id, 'title': 'changed'}}]),
    ):
        with pytest.raises(DomainError, match='review_in_progress'):
            operation()
    s.update_quest_appearance(db, page.id, q.id, 20, 30)
    s.pin_quest(db, p.id, q.id)


def test_deleting_completed_project_deletes_review_evidence(db: Session, tmp_path: Path) -> None:
    from miquest.evidence import prepare_evidence

    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    evidence = prepare_evidence(tmp_path / 'evidence', [('proof.txt', [b'proof'])])
    run = start_run(db, q.id, '  ', 'mock/reviewer', 'none', evidence)
    finish_run(db, run.id, 'pass', 'done', [])
    s.delete_project(db, p.id, True)
    assert not evidence[0].retained_path.exists()


def test_snapshot_contains_prerequisite_history_and_previous_feedback(db: Session) -> None:
    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    a, _ = s.create_quest(db, p.id, 'prerequisite', page.id, 0, 0, acceptance_criteria='condition')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    s.add_dependency(db, q.id, a.id)
    s.submit_verification(db, a.id, 'pass', 'checked', 'proof')
    first = start_run(db, q.id, 'proof', 'mock/reviewer', 'none')
    finish_run(db, first.id, 'fail', 'missing', ['condition'])
    second = start_run(db, q.id, 'new proof', 'mock/reviewer', 'none')
    snapshot = json.loads(second.snapshot_json)
    assert snapshot['prerequisites'][0]['latestVerdict'] == {'verdict': 'pass', 'reasoning': 'checked'}
    assert snapshot['previous']['unmetCriteria'] == ['condition']


def test_evidence_remains_accessible_after_data_directory_move(tmp_path: Path) -> None:
    import shutil

    from sqlalchemy import select

    from miquest.evidence import prepare_evidence
    from miquest.models import ReviewAttachment
    from miquest.review_runs import attachment_path

    old = tmp_path / 'old'
    old.mkdir()
    engine = create_engine_for_path(old / 'db.sqlite3')
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as db:
        p = s.create_project(db, 'project')
        page = s.create_page(db, p.id, 'page')
        q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
        files = prepare_evidence(old / 'evidence', [('proof.txt', [b'proof'])])
        start_run(db, q.id, ' ', 'mock/reviewer', 'none', files)
        attachment_id = db.scalar(select(ReviewAttachment.id))
    engine.dispose()
    new = tmp_path / 'new'
    shutil.move(old, new)
    with make_session_factory(create_engine_for_path(new / 'db.sqlite3'))() as db:
        assert attachment_id is not None
        path, _, _ = attachment_path(db, attachment_id, new / 'evidence')
        assert path.read_bytes() == b'proof'


def test_mock_provider_error_preserves_usage_and_generation_id(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    from typing import Any

    from miquest import openrouter
    from miquest.review_runs import execute_run

    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    run = start_run(db, q.id, 'proof', 'mock/reviewer', 'none')
    def incomplete(_request: dict[str, Any], _key: str) -> dict[str, Any]:
        return {'id': 'gen-test', 'usage': {'prompt_tokens': 123, 'completion_tokens': 45, 'cost': 0.012},
                'choices': [{'finish_reason': 'length', 'message': {'content': ''}}]}
    monkeypatch.setattr(openrouter, 'complete', incomplete)
    execute_run(make_session_factory(db.get_bind().engine), run.id, 'test-only-key')
    db.expire_all()
    assert run.status == 'error' and run.verdict is None
    assert run.error is not None and 'output token limit' in run.error
    assert json.loads(run.usage_json) == {'generationId': 'gen-test', 'inputTokens': 123, 'outputTokens': 45, 'totalCost': 0.012}
    assert q.completion_state == 'none'


def test_mock_pass_uses_snapshot_without_holding_db_connection(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    from typing import Any

    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    from miquest import openrouter
    from miquest.review_runs import execute_run

    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0, acceptance_criteria='criterion')
    run = start_run(db, q.id, 'proof', 'mock/reviewer', 'none')
    engine: Engine = db.get_bind().engine
    checked_out = 0
    def on_checkout(_connection: object, _record: object, _proxy: object) -> None:
        nonlocal checked_out
        checked_out += 1
    def on_checkin(_connection: object, _record: object) -> None:
        nonlocal checked_out
        checked_out -= 1
    event.listen(engine, 'checkout', on_checkout)
    event.listen(engine, 'checkin', on_checkin)
    def reviewer(request: dict[str, Any], _key: str) -> dict[str, Any]:
        assert checked_out == 0
        assert 'criterion' in request['messages'][1]['content'][0]['text']
        return {'id': 'gen-mock', 'usage': {'prompt_tokens': 10, 'completion_tokens': 3, 'cost': 0.001},
                'choices': [{'finish_reason': 'stop', 'message': {'content': '{"verdict":"pass","reasoning":"met","unmetCriteria":[]}'}}]}
    try:
        monkeypatch.setattr(openrouter, 'complete', reviewer)
        execute_run(make_session_factory(engine), run.id, 'test-only-key')
    finally:
        event.remove(engine, 'checkout', on_checkout)
        event.remove(engine, 'checkin', on_checkin)
    db.expire_all()
    assert q.completion_state == 'verified'
    assert run.status == 'completed' and run.completion_applied == 1
    assert json.loads(run.usage_json)['generationId'] == 'gen-mock'


def test_concurrent_submissions_allow_only_one_active_run(db: Session) -> None:
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    quest_id = q.id
    factory = make_session_factory(db.get_bind().engine)
    barrier = Barrier(2)
    def submit() -> str:
        with factory() as session:
            barrier.wait(timeout=5)
            try:
                start_run(session, quest_id, 'proof', 'mock/reviewer', 'none')
                return 'started'
            except DomainError as exc:
                return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(submit) for _ in range(2)]
        outcomes = [future.result() for future in futures]
    assert sorted(outcomes) == ['review_in_progress', 'started']


def test_run_checks_selected_model_context_window(db: Session) -> None:
    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0, description='x' * 10000)
    with pytest.raises(DomainError, match='context_overflow'):
        start_run(db, q.id, 'proof', 'mock/reviewer', 'none', context_length=25000)
    run = start_run(db, q.id, 'proof', 'mock/reviewer', 'none', context_length=50000)
    assert run.model == 'mock/reviewer'


def test_provider_failure_is_run_error_and_preserves_accounting(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    from typing import Any

    from miquest import openrouter
    from miquest.review_runs import execute_run

    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    run = start_run(db, q.id, 'proof', 'mock/reviewer', 'none')
    def fail(_request: dict[str, Any], _key: str) -> dict[str, Any]:
        raise openrouter.ProviderError('OpenRouter reports insufficient credit.', {'generationId': 'gen-failed', 'inputTokens': 6})
    monkeypatch.setattr(openrouter, 'complete', fail)
    execute_run(make_session_factory(db.get_bind().engine), run.id, 'test-only-key')
    db.expire_all()
    assert run.status == 'error' and run.verdict is None
    assert run.error == 'OpenRouter reports insufficient credit.'
    assert json.loads(run.usage_json) == {'generationId': 'gen-failed', 'inputTokens': 6}
    assert q.completion_state == 'none'


def test_deletion_rolls_back_when_evidence_cannot_be_staged(db: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from miquest.evidence import prepare_evidence
    from miquest.review_runs import fail_run

    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    evidence = prepare_evidence(tmp_path / 'evidence', [('proof.txt', [b'proof'])])
    run = start_run(db, q.id, '', 'mock/model', '', evidence)
    fail_run(db, run.id, 'failed')
    def fail_rename(self: Path, target: object) -> Path:
        raise OSError('disk error')
    monkeypatch.setattr(Path, 'rename', fail_rename)
    with pytest.raises(OSError, match='disk error'):
        s.delete_quest(db, q.id, True)
    assert evidence[0].retained_path.read_bytes() == b'proof'
    assert s.get_quest(db, q.id)['quest']['id'] == q.id


def test_deletion_restores_staged_evidence_when_commit_fails(db: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from miquest.evidence import prepare_evidence
    from miquest.review_runs import fail_run

    p = s.create_project(db, 'project')
    page = s.create_page(db, p.id, 'page')
    q, _ = s.create_quest(db, p.id, 'quest', page.id, 0, 0)
    evidence = prepare_evidence(tmp_path / 'evidence', [('proof.txt', [b'proof'])])
    run = start_run(db, q.id, '', 'mock/model', '', evidence)
    fail_run(db, run.id, 'failed')
    def fail_commit() -> None:
        raise RuntimeError('commit failed')
    monkeypatch.setattr(db, 'commit', fail_commit)
    with pytest.raises(RuntimeError, match='commit failed'):
        s.delete_quest(db, q.id, True)
    assert evidence[0].retained_path.read_bytes() == b'proof'
    assert s.get_quest(db, q.id)['quest']['id'] == q.id
