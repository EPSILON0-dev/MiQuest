import json
import math
from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime
from functools import wraps
from sqlite3 import Connection as SQLiteConnection
from typing import Concatenate, NoReturn, TypedDict, cast
from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .errors import DomainError
from .models import (
    Base,
    Dependency,
    Page,
    Pin,
    Project,
    Quest,
    QuestAppearance,
    Verification,
)


class QuestView(TypedDict):
    id: str
    projectId: str
    title: str
    description: str
    acceptanceCriteria: str
    workState: str
    completionState: str
    icon: str
    milestone: bool
    homePageId: str
    createdAt: str
    updatedAt: str
    unlocked: bool
    unsatisfiedPrerequisiteIds: list[str]
    status: str


class QuestDetails(TypedDict):
    quest: QuestView
    appearances: list[QuestAppearance]
    prerequisites: list[QuestView]
    nextQuests: list[QuestView]


class ProjectGraph(TypedDict):
    project: Project
    pages: list[Page]
    quests: list[QuestView]
    appearances: list[QuestAppearance]
    dependencies: list[Dependency]
    pins: list[Pin]


class ExternalLink(TypedDict):
    direction: str
    localQuestId: str
    remoteQuest: QuestView


class PinnedQuest(TypedDict):
    pin: Pin
    quest: QuestView


class PageGraph(TypedDict):
    project: Project
    page: Page
    quests: list[QuestView]
    appearances: list[QuestAppearance]
    dependencies: list[Dependency]
    externalLinks: list[ExternalLink]
    pins: list[PinnedQuest]


class VerificationHistory(TypedDict):
    items: list[Verification]
    nextAfterSequence: int | None


def now() -> str:
    return datetime.now(UTC).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def fail(code: str, **details: object) -> NoReturn:
    raise DomainError(code, details=details)


def mutation[**P, T](fn: Callable[Concatenate[Session, P], T]) -> Callable[Concatenate[Session, P], T]:
    @wraps(fn)
    def run(db: Session, *args: P.args, **kwargs: P.kwargs) -> T:
        if db.new or db.dirty or db.deleted:
            raise RuntimeError('Session has pending changes')
        try:
            if db.in_transaction():
                db.rollback()
            db.connection().exec_driver_sql('BEGIN IMMEDIATE')
            db.expire_all()
            result = fn(db, *args, **kwargs)
            db.flush()
            callback = db.info.get('mutation_snapshot')
            if callback is not None:
                callback(result)
            db.commit()
            return result
        except OperationalError as exc:
            db.rollback()
            if 'locked' in str(exc).lower() or 'busy' in str(exc).lower():
                fail('database_busy')
            raise
        except Exception:
            db.rollback()
            raise
    return run


def read_snapshot[**P, T](fn: Callable[Concatenate[Session, P], T]) -> Callable[Concatenate[Session, P], T]:
    @wraps(fn)
    def run(db: Session, *args: P.args, **kwargs: P.kwargs) -> T:
        connection = db.connection()
        if not cast(SQLiteConnection, connection.connection.driver_connection).in_transaction:
            if db.new or db.dirty or db.deleted:
                raise RuntimeError('Session has pending changes')
            connection.exec_driver_sql('BEGIN')
            db.expire_all()
        return fn(db, *args, **kwargs)
    return run


def get[Model: Base](db: Session, cls: type[Model], ident: object, code: str) -> Model:
    value = db.get(cls, ident)
    if value is None:
        fail(code)
    return value


def project(db: Session, ident: str, expected_revision: int | None=None) -> Project:
    value = get(db, Project, ident, 'project_not_found')
    if expected_revision is not None and value.revision != expected_revision:
        fail('stale_revision', currentRevision=value.revision)
    return value


def changed(p: Project) -> None:
    p.revision += 1
    p.updated_at = now()


def text(value: object, limit: int, required: bool=False) -> str:
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        fail('invalid_input')
    return value.strip() if required else value


def coordinates(x: object, y: object) -> None:
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) > 1000000 for v in (x, y)):
        fail('invalid_input')


def same_project(*objects: Page | Quest) -> None:
    if len({o.project_id for o in objects}) != 1:
        fail('cross_project_reference')


@read_snapshot
def list_projects(db: Session) -> list[Project]:
    return list(db.scalars(select(Project).order_by(Project.created_at, Project.id)))


@mutation
def create_project(db: Session, name: str, description: str='') -> Project:
    p = Project(id=str(uuid4()), name=text(name, 200, True), description=text(description, 100000), revision=0, created_at=now(), updated_at=now())
    db.add(p)
    return p


@mutation
def update_project(db: Session, project_id: str, expected_revision: int | None=None, **fields: object) -> Project:
    p = project(db, project_id, expected_revision)
    if not fields or set(fields) - {'name', 'description'}: fail('invalid_input')
    fields = {key: text(value, 200 if key == 'name' else 100000, key == 'name') for key, value in fields.items()}
    if any(getattr(p, key) != value for key, value in fields.items()):
        for key, value in fields.items(): setattr(p, key, value)
        changed(p)
    return p


@mutation
def delete_project(db: Session, project_id: str, confirm_delete: bool=False, expected_revision: int | None=None) -> str:
    p = project(db, project_id, expected_revision)
    if confirm_delete is not True: fail('confirmation_required')
    db.execute(delete(Quest).where(Quest.project_id == p.id))
    db.execute(delete(Page).where(Page.project_id == p.id))
    db.delete(p)
    return project_id


@read_snapshot
def list_pages(db: Session, project_id: str) -> list[Page]:
    project(db, project_id)
    return list(db.scalars(select(Page).where(Page.project_id == project_id).order_by(Page.created_at, Page.id)))


@mutation
def create_page(db: Session, project_id: str, name: str, expected_revision: int | None=None) -> Page:
    p = project(db, project_id, expected_revision)
    page = Page(id=str(uuid4()), project_id=p.id, name=text(name, 200, True), created_at=now(), updated_at=now())
    db.add(page); changed(p)
    return page


@mutation
def update_page(db: Session, page_id: str, name: str, expected_revision: int | None=None) -> Page:
    page = get(db, Page, page_id, 'page_not_found'); p = project(db, page.project_id, expected_revision)
    name = text(name, 200, True)
    if page.name != name: page.name = name; page.updated_at = now(); changed(p)
    return page


@read_snapshot
def list_quests(db: Session, project_id: str) -> list[Quest]:
    project(db, project_id)
    return list(db.scalars(select(Quest).where(Quest.project_id == project_id).order_by(Quest.created_at, Quest.id)))


def validate_quest_fields(fields: dict[str, object]) -> None:
    allowed = {'title', 'description', 'acceptance_criteria', 'work_state', 'icon_name', 'milestone', 'home_page_id'}
    if set(fields) - allowed: fail('invalid_input')
    for key in ('title', 'description', 'acceptance_criteria'):
        if key in fields: fields[key] = text(fields[key], 200 if key == 'title' else 100000, key == 'title')
    if 'work_state' in fields and fields['work_state'] not in ('not_started', 'in_progress', 'blocked'): fail('invalid_input')
    if 'milestone' in fields and not isinstance(fields['milestone'], bool): fail('invalid_input')
    if 'icon_name' in fields:
        from .icons import ICON_NAMES
        if fields['icon_name'] not in ICON_NAMES: fail('invalid_icon')


@mutation
def create_quest(db: Session, project_id: str, title: str, page_id: str, x: float, y: float, expected_revision: int | None=None, **fields: object) -> tuple[Quest, QuestAppearance]:
    p = project(db, project_id, expected_revision); page = get(db, Page, page_id, 'page_not_found')
    if page.project_id != p.id: fail('cross_project_reference')
    coordinates(x, y); fields['title'] = title; validate_quest_fields(fields)
    if 'home_page_id' in fields: fail('invalid_input')
    q = Quest(id=str(uuid4()), project_id=p.id, title=fields.pop('title'), description='', acceptance_criteria='', work_state='not_started', completion_state='none', icon_name='compass', milestone=False, home_page_id=page.id, created_at=now(), updated_at=now())
    for key, value in fields.items(): setattr(q, key, value)
    a = QuestAppearance(page_id=page.id, quest_id=q.id, project_id=p.id, position_x=x, position_y=y)
    db.add(q); db.flush(); db.add(a); changed(p)
    return q, a


@mutation
def update_quest(db: Session, quest_id: str, expected_revision: int | None=None, **fields: object) -> Quest:
    q = get(db, Quest, quest_id, 'quest_not_found'); p = project(db, q.project_id, expected_revision)
    if not fields: fail('invalid_input')
    validate_quest_fields(fields)
    if 'home_page_id' in fields and not db.get(QuestAppearance, (fields['home_page_id'], q.id)): fail('invalid_home_page')
    if any(getattr(q, key) != value for key, value in fields.items()):
        for key, value in fields.items(): setattr(q, key, value)
        q.updated_at = now(); changed(p)
    return q


def compact_pins(db: Session, project_id: str) -> None:
    pins = list(db.scalars(select(Pin).where(Pin.project_id == project_id).order_by(Pin.sort_order)))
    ids = [pin.quest_id for pin in pins]
    db.execute(delete(Pin).where(Pin.project_id == project_id)); db.flush()
    db.add_all([Pin(project_id=project_id, quest_id=qid, sort_order=i) for i, qid in enumerate(ids)])


def delete_quest_inner(db: Session, q: Quest) -> None:
    pid = q.project_id
    db.delete(q); db.flush(); compact_pins(db, pid)


@mutation
def delete_quest(db: Session, quest_id: str, confirm_delete: bool=False, expected_revision: int | None=None) -> str:
    q = get(db, Quest, quest_id, 'quest_not_found'); p = project(db, q.project_id, expected_revision)
    if confirm_delete is not True: fail('confirmation_required')
    delete_quest_inner(db, q); changed(p)
    return quest_id


@mutation
def add_quest_to_page(db: Session, page_id: str, quest_id: str, x: float, y: float, expected_revision: int | None=None) -> QuestAppearance:
    page = get(db, Page, page_id, 'page_not_found'); q = get(db, Quest, quest_id, 'quest_not_found'); same_project(page, q)
    p = project(db, q.project_id, expected_revision); coordinates(x, y)
    a = db.get(QuestAppearance, (page_id, quest_id))
    if a and a.position_x == x and a.position_y == y: return a
    if not a:
        a = QuestAppearance(page_id=page_id, quest_id=quest_id, project_id=p.id, position_x=x, position_y=y); db.add(a)
    else: a.position_x, a.position_y = x, y
    changed(p); return a


@mutation
def update_quest_appearance(db: Session, page_id: str, quest_id: str, x: float, y: float, expected_revision: int | None=None) -> QuestAppearance:
    page = get(db, Page, page_id, 'page_not_found'); q = get(db, Quest, quest_id, 'quest_not_found'); same_project(page, q)
    p = project(db, q.project_id, expected_revision); coordinates(x, y)
    a = db.get(QuestAppearance, (page_id, quest_id))
    if not a: fail('appearance_not_found')
    if (a.position_x, a.position_y) != (x, y): a.position_x, a.position_y = x, y; changed(p)
    return a


@mutation
def remove_quest_from_page(db: Session, page_id: str, quest_id: str, new_home_page_id: str | None=None, expected_revision: int | None=None) -> Quest:
    page = get(db, Page, page_id, 'page_not_found'); q = get(db, Quest, quest_id, 'quest_not_found'); same_project(page, q)
    p = project(db, q.project_id, expected_revision); a = db.get(QuestAppearance, (page_id, quest_id))
    if not a: fail('appearance_not_found')
    others = list(db.scalars(select(QuestAppearance).where(QuestAppearance.quest_id == quest_id, QuestAppearance.page_id != page_id)))
    if not others: fail('quest_would_be_orphaned')
    if q.home_page_id == page_id:
        if not new_home_page_id: fail('home_page_required')
        if new_home_page_id not in [v.page_id for v in others]: fail('invalid_home_page')
        q.home_page_id = new_home_page_id
    elif new_home_page_id: fail('invalid_input')
    db.delete(a); changed(p); return q


@mutation
def update_page_positions(db: Session, page_id: str, positions: Sequence[Mapping[str, object]], expected_revision: int | None=None) -> list[QuestAppearance]:
    page = get(db, Page, page_id, 'page_not_found'); p = project(db, page.project_id, expected_revision)
    seen: set[str] = set(); result: list[QuestAppearance] = []; modified = False
    for item in positions:
        qid = item.get('quest_id', item.get('questId')); x = item['x']; y = item['y']; coordinates(x, y)
        x, y = cast(float, x), cast(float, y)
        if not isinstance(qid, str) or qid in seen: fail('invalid_input')
        seen.add(qid); a = db.get(QuestAppearance, (page_id, qid))
        if not a: fail('appearance_not_found')
        if (a.position_x, a.position_y) != (x, y): a.position_x, a.position_y = x, y; modified = True
        result.append(a)
    if modified: changed(p)
    return result


@mutation
def add_dependency(db: Session, quest_id: str, depends_on_quest_id: str, expected_revision: int | None=None) -> Dependency:
    q = get(db, Quest, quest_id, 'quest_not_found'); dep = get(db, Quest, depends_on_quest_id, 'quest_not_found'); same_project(q, dep)
    p = project(db, q.project_id, expected_revision)
    if quest_id == depends_on_quest_id: fail('self_dependency')
    if db.get(Dependency, (quest_id, depends_on_quest_id)): fail('dependency_exists')
    edges = list(db.scalars(select(Dependency).where(Dependency.project_id == p.id)))
    adjacency: dict[str, list[str]] = {}
    for edge in edges: adjacency.setdefault(edge.quest_id, []).append(edge.depends_on_quest_id)
    stack = [depends_on_quest_id]; visited: set[str] = set()
    while stack:
        current = stack.pop()
        if current == quest_id: fail('dependency_cycle')
        if current not in visited: visited.add(current); stack.extend(adjacency.get(current, []))
    edge = Dependency(quest_id=quest_id, depends_on_quest_id=depends_on_quest_id, project_id=p.id); db.add(edge); changed(p)
    return edge


@mutation
def remove_dependency(db: Session, quest_id: str, depends_on_quest_id: str, expected_revision: int | None=None) -> dict[str, str]:
    q = get(db, Quest, quest_id, 'quest_not_found'); dep = get(db, Quest, depends_on_quest_id, 'quest_not_found'); same_project(q, dep)
    p = project(db, q.project_id, expected_revision); edge = db.get(Dependency, (quest_id, depends_on_quest_id))
    if edge: db.delete(edge); changed(p)
    return {'questId': quest_id, 'dependsOnQuestId': depends_on_quest_id}


@read_snapshot
def list_pins(db: Session, project_id: str) -> list[Pin]:
    project(db, project_id)
    return list(db.scalars(select(Pin).where(Pin.project_id == project_id).order_by(Pin.sort_order)))


@mutation
def pin_quest(db: Session, project_id: str, quest_id: str, expected_revision: int | None=None) -> Pin:
    p = project(db, project_id, expected_revision); q = get(db, Quest, quest_id, 'quest_not_found')
    if q.project_id != p.id: fail('cross_project_reference')
    pin = db.get(Pin, (project_id, quest_id))
    if not pin:
        pin = Pin(project_id=project_id, quest_id=quest_id, sort_order=len(list_pins(db, project_id))); db.add(pin); changed(p)
    return pin


@mutation
def unpin_quest(db: Session, project_id: str, quest_id: str, expected_revision: int | None=None) -> str:
    p = project(db, project_id, expected_revision); q = get(db, Quest, quest_id, 'quest_not_found')
    if q.project_id != p.id: fail('cross_project_reference')
    pin = db.get(Pin, (project_id, quest_id))
    if pin: db.delete(pin); db.flush(); compact_pins(db, project_id); changed(p)
    return quest_id


@mutation
def reorder_pins(db: Session, project_id: str, quest_ids: list[str], expected_revision: int | None=None) -> list[Pin]:
    p = project(db, project_id, expected_revision); pins = list_pins(db, project_id); old = [pin.quest_id for pin in pins]
    if len(quest_ids) != len(old) or len(set(quest_ids)) != len(quest_ids) or set(quest_ids) != set(old): fail('invalid_pin_order')
    if old != quest_ids:
        db.execute(delete(Pin).where(Pin.project_id == project_id)); db.flush()
        pins = [Pin(project_id=project_id, quest_id=qid, sort_order=i) for i, qid in enumerate(quest_ids)]
        db.add_all(pins); changed(p)
    return pins


@read_snapshot
def get_project(db: Session, project_id: str) -> Project:
    return project(db, project_id)


@read_snapshot
def get_page(db: Session, page_id: str) -> Page:
    return get(db, Page, page_id, 'page_not_found')


def prerequisites(db: Session, quest_id: str) -> list[Quest]:
    return list(db.scalars(select(Quest).join(Dependency, Dependency.depends_on_quest_id == Quest.id).where(Dependency.quest_id == quest_id).order_by(Quest.id)))


def quest_view(db: Session, q: Quest) -> QuestView:
    missing = [v.id for v in prerequisites(db, q.id) if v.completion_state == 'none']
    status = 'locked' if missing else q.completion_state if q.completion_state != 'none' else 'available' if q.work_state == 'not_started' else q.work_state
    return {'id': q.id, 'projectId': q.project_id, 'title': q.title, 'description': q.description,
            'acceptanceCriteria': q.acceptance_criteria, 'workState': q.work_state, 'completionState': q.completion_state,
            'icon': q.icon_name, 'milestone': bool(q.milestone), 'homePageId': q.home_page_id,
            'createdAt': q.created_at, 'updatedAt': q.updated_at, 'unlocked': not missing,
            'unsatisfiedPrerequisiteIds': missing, 'status': status}


@read_snapshot
def get_quest(db: Session, quest_id: str) -> QuestDetails:
    q = get(db, Quest, quest_id, 'quest_not_found')
    appearances = list(db.scalars(select(QuestAppearance).where(QuestAppearance.quest_id == q.id).order_by(QuestAppearance.page_id)))
    next_quests = list(db.scalars(select(Quest).join(Dependency, Dependency.quest_id == Quest.id).where(Dependency.depends_on_quest_id == q.id).order_by(Quest.id)))
    return {'quest': quest_view(db, q), 'appearances': appearances, 'prerequisites': [quest_view(db, v) for v in prerequisites(db, q.id)], 'nextQuests': [quest_view(db, v) for v in next_quests]}


@read_snapshot
def get_project_graph(db: Session, project_id: str) -> ProjectGraph:
    p = project(db, project_id)
    return {'project': p, 'pages': list_pages(db, project_id), 'quests': [quest_view(db, q) for q in list_quests(db, project_id)],
            'appearances': list(db.scalars(select(QuestAppearance).where(QuestAppearance.project_id == project_id).order_by(QuestAppearance.page_id, QuestAppearance.quest_id))),
            'dependencies': list(db.scalars(select(Dependency).where(Dependency.project_id == project_id).order_by(Dependency.quest_id, Dependency.depends_on_quest_id))),
            'pins': list_pins(db, project_id)}


@read_snapshot
def get_page_graph(db: Session, page_id: str) -> PageGraph:
    page = get_page(db, page_id); graph = get_project_graph(db, page.project_id)
    appearances = [a for a in graph['appearances'] if a.page_id == page_id]
    ids = {a.quest_id for a in appearances}; views = {q['id']: q for q in graph['quests']}
    internal: list[Dependency] = []; external: list[ExternalLink] = []
    for edge in graph['dependencies']:
        dependent, prerequisite = edge.quest_id, edge.depends_on_quest_id
        if dependent in ids and prerequisite in ids: internal.append(edge)
        elif dependent in ids: external.append({'direction': 'prerequisite', 'localQuestId': dependent, 'remoteQuest': views[prerequisite]})
        elif prerequisite in ids: external.append({'direction': 'next', 'localQuestId': prerequisite, 'remoteQuest': views[dependent]})
    return {'project': graph['project'], 'page': page, 'quests': [q for q in graph['quests'] if q['id'] in ids],
            'appearances': appearances, 'dependencies': internal, 'externalLinks': external,
            'pins': [{'pin': pin, 'quest': views[pin.quest_id]} for pin in graph['pins']]}


@mutation
def delete_page(db: Session, page_id: str, confirm_delete: bool=False, quest_actions: Sequence[Mapping[str, object]] | None=None, expected_revision: int | None=None) -> str:
    page = get_page(db, page_id); p = project(db, page.project_id, expected_revision)
    if confirm_delete is not True: fail('confirmation_required')
    actions = quest_actions or []; by_id: dict[str, Mapping[str, object]] = {}
    for action in actions:
        qid = action.get('quest_id', action.get('questId'))
        if not isinstance(qid, str) or qid in by_id: fail('invalid_input')
        by_id[qid] = action
    appearances = list(db.scalars(select(QuestAppearance).where(QuestAppearance.page_id == page_id)))
    if set(by_id) - {a.quest_id for a in appearances}: fail('invalid_input')
    for appearance in appearances:
        q = get(db, Quest, appearance.quest_id, 'quest_not_found'); action = by_id.get(q.id)
        others = list(db.scalars(select(QuestAppearance).where(QuestAppearance.quest_id == q.id, QuestAppearance.page_id != page_id)))
        if not action:
            if not others: fail('quest_would_be_orphaned')
            if q.home_page_id == page_id: fail('home_page_required')
            continue
        kind = action.get('action'); target_id = action.get('target_page_id', action.get('targetPageId'))
        if kind == 'delete':
            if action.get('confirm_delete', action.get('confirmDelete', False)) is not True: fail('confirmation_required')
            delete_quest_inner(db, q); continue
        if kind not in ('move', 'rehome') or not isinstance(target_id, str) or target_id == page_id: fail('invalid_input')
        target = get(db, Page, target_id, 'page_not_found'); same_project(page, target)
        target_appearance = db.get(QuestAppearance, (target_id, q.id))
        if kind == 'rehome' and not target_appearance: fail('invalid_home_page')
        if kind == 'move':
            x, y = action.get('x'), action.get('y'); coordinates(x, y)
            if target_appearance: fail('invalid_input')
            db.add(QuestAppearance(page_id=target_id, quest_id=q.id, project_id=p.id, position_x=x, position_y=y))
        if kind == 'rehome' or q.home_page_id == page_id: q.home_page_id = target_id
    db.flush(); db.delete(page); changed(p)
    return page_id


@read_snapshot
def get_verification_history(db: Session, quest_id: str, after_sequence: object=0, limit: object=50) -> VerificationHistory:
    get(db, Quest, quest_id, 'quest_not_found')
    if isinstance(after_sequence, bool) or not isinstance(after_sequence, int) or after_sequence < 0 or isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 200: fail('invalid_input')
    rows = list(db.scalars(select(Verification).where(Verification.quest_id == quest_id, Verification.sequence > after_sequence).order_by(Verification.sequence).limit(limit + 1)))
    return {'items': rows[:limit], 'nextAfterSequence': rows[limit - 1].sequence if len(rows) > limit else None}


def verification(db: Session, q: Quest, verdict: str, actor: str, reasoning: object, evidence: object='') -> Verification:
    if not isinstance(reasoning, str) or not reasoning.strip() or len(reasoning) > 20000: fail('reason_required')
    if not isinstance(evidence, str) or len(evidence) > 100000: fail('invalid_input')
    if verdict == 'pass' and not evidence.strip(): fail('evidence_required')
    prior = prerequisites(db, q.id)
    if verdict == 'pass' and any(v.completion_state == 'none' for v in prior): fail('prerequisites_unsatisfied')
    snapshot_prior: list[dict[str, str | None]] = []
    snapshot = {'title': q.title, 'description': q.description, 'acceptanceCriteria': q.acceptance_criteria, 'prerequisites': snapshot_prior}
    for v in prior:
        event = db.scalar(select(Verification).where(Verification.quest_id == v.id, Verification.verdict.in_(['pass', 'override', 'reopen'])).order_by(Verification.sequence.desc()).limit(1))
        snapshot_prior.append({'questId': v.id, 'completionState': v.completion_state, 'latestCompletionEventId': event.id if event else None})
    seq = db.scalar(select(func.max(Verification.sequence)).where(Verification.quest_id == q.id)) or 0
    event = Verification(id=str(uuid4()), quest_id=q.id, sequence=seq + 1, verdict=verdict, actor=actor, evidence=evidence, reasoning=reasoning.strip(), snapshot_json=json.dumps(snapshot), created_at=now())
    db.add(event)
    if verdict == 'pass': q.completion_state = 'verified'
    elif verdict == 'override': q.completion_state = 'overridden'
    elif verdict == 'reopen': q.completion_state = 'none'; q.work_state = 'not_started'
    q.updated_at = now()
    return event


@mutation
def submit_verification(db: Session, quest_id: str, verdict: str, reasoning: str, evidence: str='', expected_revision: int | None=None) -> tuple[Quest, Verification]:
    q = get(db, Quest, quest_id, 'quest_not_found'); p = project(db, q.project_id, expected_revision)
    if verdict not in ('pass', 'fail', 'inconclusive'): fail('invalid_input')
    event = verification(db, q, verdict, 'agent', reasoning, evidence); changed(p)
    return q, event


@mutation
def override_quest(db: Session, quest_id: str, reason: str, confirm_override: bool=False, expected_revision: int | None=None) -> tuple[Quest, Verification]:
    q = get(db, Quest, quest_id, 'quest_not_found'); p = project(db, q.project_id, expected_revision)
    if confirm_override is not True: fail('confirmation_required')
    event = verification(db, q, 'override', 'human', reason); changed(p)
    return q, event


@mutation
def reopen_quest(db: Session, quest_id: str, reason: str, actor: str='human', expected_revision: int | None=None) -> tuple[Quest, Verification]:
    q = get(db, Quest, quest_id, 'quest_not_found'); p = project(db, q.project_id, expected_revision)
    if actor not in ('human', 'agent') or q.completion_state == 'none': fail('invalid_input')
    event = verification(db, q, 'reopen', actor, reason); changed(p)
    return q, event
