"""Durable review lifecycle. Provider work runs outside database transactions."""

import json
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import services as s
from .errors import DomainError
from .evidence import EvidenceFile
from .models import Quest, ReviewAttachment, ReviewRun, Verification

ACTIVE = ('waiting', 'reviewing', 'saving')


def evidence_root(db: Session) -> Path:
    database = db.get_bind().engine.url.database
    if not database:
        raise RuntimeError('A file-backed database is required for review evidence')
    return Path(database).resolve().parent / 'evidence'


def evidence_path(db: Session, name: str) -> Path:
    if Path(name).name != name or not name.startswith('evidence-'):
        raise ValueError('Invalid evidence path')
    return evidence_root(db) / name


def require_unlocked(db: Session, quest_id: str) -> None:
    if db.scalar(select(ReviewRun.id).where(ReviewRun.quest_id == quest_id, ReviewRun.status.in_(ACTIVE))):
        s.fail('review_in_progress')


@s.mutation
def start_run(db: Session, quest_id: str, message: str, model: str, effort: str, attachments: Sequence[EvidenceFile] = (), *, context_length: int = 131072) -> ReviewRun:
    q = s.get(db, Quest, quest_id, 'quest_not_found')
    require_unlocked(db, q.id)
    if q.completion_state != 'none':
        s.fail('invalid_input')
    if (not message.strip() and not attachments) or len(message) > 100000 or not model:
        s.fail('invalid_input')
    previous = db.scalar(select(ReviewRun).where(ReviewRun.quest_id == q.id).order_by(ReviewRun.created_at.desc(), ReviewRun.id.desc()).limit(1))
    external = db.scalar(select(Verification).where(Verification.quest_id == q.id, Verification.actor == 'agent', Verification.verdict.in_(['pass', 'fail', 'inconclusive'])).order_by(Verification.sequence.desc()).limit(1))
    if external and (not previous or external.created_at > previous.updated_at):
        previous_result = {'verdict': external.verdict, 'reasoning': external.reasoning}
    elif previous and previous.verdict:
        previous_result = {'verdict': previous.verdict, 'reasoning': previous.reasoning, 'unmetCriteria': json.loads(previous.unmet_json)}
    else:
        previous_result = None
    prior = s.prerequisites(db, q.id)
    prerequisite_context: list[dict[str, object]] = []
    for prerequisite in prior:
        event = db.scalar(select(Verification).where(Verification.quest_id == prerequisite.id).order_by(Verification.sequence.desc()).limit(1))
        prerequisite_context.append({'title': prerequisite.title, 'description': prerequisite.description,
                                     'acceptanceCriteria': prerequisite.acceptance_criteria,
                                     'completionState': prerequisite.completion_state,
                                     'latestVerdict': {'verdict': event.verdict, 'reasoning': event.reasoning} if event else None})
    snapshot = {'title': q.title, 'description': q.description, 'acceptanceCriteria': q.acceptance_criteria,
                'prerequisites': prerequisite_context,
                'previous': previous_result}
    # Reserve output and prompt overhead; count each text byte as a token.
    context = len(json.dumps(snapshot, ensure_ascii=False).encode('utf-8')) + len(message.encode('utf-8')) + 4096 + 16384
    for attachment in attachments:
        context += len(attachment.name.encode('utf-8'))
        if attachment.media_type.startswith('image/'):
            with Image.open(attachment.original_path) as image:
                context += (image.width * image.height + 31) // 32 + 1024
        else:
            context += attachment.size
    if context > context_length:
        raise DomainError('context_overflow', 'Evidence and quest context exceed the model window; remove evidence or shorten the quest.')
    timestamp = s.now()
    run = ReviewRun(id=str(uuid4()), quest_id=q.id, status='waiting', message=message, model=model, effort=effort,
                    snapshot_json=json.dumps(snapshot), verdict=None, reasoning=None, unmet_json='[]', completion_applied=0,
                    error=None, verification_id=None, usage_json='{}', created_at=timestamp, updated_at=timestamp)
    db.add(run)
    db.flush()
    for attachment in attachments:
        if attachment.retained_path.resolve().parent != evidence_root(db) or attachment.original_path.resolve().parent != evidence_root(db):
            s.fail('invalid_input')
        db.add(ReviewAttachment(id=str(uuid4()), run_id=run.id, name=attachment.name, media_type=attachment.media_type,
                                size=attachment.size, original_path=attachment.original_path.name if attachment.original_path != attachment.retained_path else None,
                                retained_path=attachment.retained_path.name))
    return run


@s.mutation
def finish_run(db: Session, run_id: str, verdict: str, reasoning: str, unmet: list[str]) -> ReviewRun:
    run = s.get(db, ReviewRun, run_id, 'review_run_not_found')
    if run.status not in ACTIVE or verdict not in ('pass', 'fail', 'inconclusive') or not reasoning.strip() or len(reasoning) > 20000 or any(not item.strip() for item in unmet):
        s.fail('invalid_input')
    q = s.get(db, Quest, run.quest_id, 'quest_not_found')
    run.verdict, run.reasoning, run.unmet_json = verdict, reasoning.strip(), json.dumps(unmet)
    can_complete = all(p.completion_state != 'none' for p in s.prerequisites(db, q.id))
    if verdict != 'pass' or can_complete:
        evidence = run.message if run.message.strip() else 'Evidence attachments submitted.'
        event: Verification = s.verification(db, q, verdict, 'agent', reasoning, evidence)
        db.flush()
        run.verification_id = event.id
        run.completion_applied = int(verdict == 'pass')
        s.changed(s.project(db, q.project_id))
    elif verdict == 'pass':
        run.error = 'Prerequisites changed during review; completion was not applied.'
    run.status = 'completed'
    run.updated_at = s.now()
    return run


@s.mutation
def fail_run(db: Session, run_id: str, error: str) -> ReviewRun:
    run = s.get(db, ReviewRun, run_id, 'review_run_not_found')
    if run.status in ACTIVE:
        run.status, run.error, run.updated_at = 'error', error, s.now()
    return run


@s.mutation
def interrupt_runs(db: Session) -> None:
    for run in db.scalars(select(ReviewRun).where(ReviewRun.status.in_(ACTIVE))):
        run.status, run.error, run.updated_at = 'interrupted', 'Backend restarted during review.', s.now()


@s.mutation
def set_stage(db: Session, run_id: str, stage: str) -> None:
    run = s.get(db, ReviewRun, run_id, 'review_run_not_found')
    if run.status not in ACTIVE or stage not in ACTIVE:
        s.fail('invalid_input')
    run.status, run.updated_at = stage, s.now()


@s.mutation
def record_usage(db: Session, run_id: str, usage: dict[str, object]) -> None:
    run = s.get(db, ReviewRun, run_id, 'review_run_not_found')
    if usage:
        run.usage_json = json.dumps(usage)


def cleanup_originals(session_factory: Callable[[], Session], run_id: str) -> None:
    with session_factory() as db:
        attachments = list(db.scalars(select(ReviewAttachment).where(ReviewAttachment.run_id == run_id)))
        for attachment in attachments:
            if attachment.original_path:
                evidence_path(db, attachment.original_path).unlink(missing_ok=True)
                attachment.original_path = None
        db.commit()


def execute_run(session_factory: Callable[[], Session], run_id: str, key: str) -> None:
    """Run one review request outside a database transaction."""
    from . import openrouter
    from .reviewer import (
        build_request,
        parse_result,
        response_accounting,
    )

    try:
        with session_factory() as db:
            set_stage(db, run_id, 'reviewing')
            run = s.get(db, ReviewRun, run_id, 'review_run_not_found')
            attachments = list(db.scalars(select(ReviewAttachment).where(ReviewAttachment.run_id == run_id)))
            files = [(item.name, item.media_type, evidence_path(db, item.original_path or item.retained_path).read_bytes()) for item in attachments]
            request = build_request(json.loads(run.snapshot_json), run.message, files, run.effort, model=run.model)
        response = openrouter.complete(request, key)
        with session_factory() as db:
            record_usage(db, run_id, response_accounting(response))
            choices = response['choices']
            if not isinstance(choices, list) or len(cast(list[object], choices)) != 1:
                raise ValueError('Reviewer did not finish')
            choice = cast(dict[str, Any], choices[0])
            if choice.get('finish_reason') == 'length':
                raise openrouter.ProviderError('The reviewer reached the output token limit. Try a different model or reasoning effort.')
            if choice.get('finish_reason') != 'stop':
                raise ValueError('Reviewer did not finish')
            decision = parse_result(cast(str, choice['message']['content']))
            set_stage(db, run_id, 'saving')
            finish_run(db, run_id, decision.verdict, decision.reasoning, decision.unmetCriteria)
    except openrouter.ProviderError as exc:
        with session_factory() as db:
            record_usage(db, run_id, exc.usage)
            fail_run(db, run_id, str(exc))
    except Exception:  # noqa: BLE001
        with session_factory() as db:
            fail_run(db, run_id, 'The reviewer returned an invalid response or could not finish the review.')
    finally:
        cleanup_originals(session_factory, run_id)


def serialize_run(db: Session, run: ReviewRun) -> dict[str, object]:
    attachments = list(db.scalars(select(ReviewAttachment).where(ReviewAttachment.run_id == run.id)))
    return {'id': run.id, 'questId': run.quest_id, 'status': run.status, 'createdAt': run.created_at,
            'updatedAt': run.updated_at, 'message': run.message, 'model': run.model, 'effort': run.effort,
            'verdict': run.verdict, 'reasoning': run.reasoning, 'unmetCriteria': json.loads(run.unmet_json),
            'completionApplied': bool(run.completion_applied), 'error': run.error, 'usage': json.loads(run.usage_json),
            'attachments': [{'id': a.id, 'name': a.name, 'url': f'/api/v1/review-attachments/{a.id}'} for a in attachments]}


def attachment_path(db: Session, attachment_id: str, data_dir: Path) -> tuple[Path, str, str]:
    attachment = s.get(db, ReviewAttachment, attachment_id, 'attachment_not_found')
    path = evidence_path(db, attachment.retained_path).resolve()
    if not path.is_relative_to(data_dir.resolve()):
        s.fail('attachment_not_found')
    if attachment.media_type.startswith('image/'):
        return path, f'{Path(attachment.name).stem}.jpg', 'image/jpeg'
    return path, attachment.name, 'text/plain; charset=utf-8'
