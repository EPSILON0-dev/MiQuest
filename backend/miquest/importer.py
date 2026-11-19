from __future__ import annotations

import json
from collections.abc import Callable
from inspect import unwrap
from typing import Literal, cast
from uuid import uuid4

from pydantic import Field, model_validator
from sqlalchemy.orm import Session

from . import schemas, services
from .icons import valid_icon
from .models import Dependency, Page, Pin, Project, Quest, QuestAppearance, Verification

type JSONValue = None | bool | int | float | str | list[JSONValue] | dict[str, JSONValue]


class ImportPosition(schemas.Input):
    quest: schemas.Name
    x: schemas.Coordinate
    y: schemas.Coordinate


class ImportPage(schemas.Input):
    key: schemas.Name
    name: schemas.Name
    quests: list[schemas.Name]
    layout: schemas.Layout = 'branching'
    positions: list[ImportPosition] = Field(default_factory=list[ImportPosition])


class ImportVerification(schemas.Input):
    key: schemas.Name
    sequence: int = Field(ge=1, strict=True)
    verdict: Literal['pass', 'fail', 'inconclusive', 'override', 'reopen']
    actor: Literal['agent', 'human']
    evidence: schemas.Text = ''
    reasoning: schemas.Reason
    created_at: schemas.Name
    snapshot: dict[str, JSONValue]

    @model_validator(mode='after')
    def valid_record(self) -> ImportVerification:
        if self.verdict == 'pass' and (self.actor != 'agent' or not self.evidence.strip()):
            raise ValueError('Pass records need agent evidence')
        if self.verdict == 'override' and self.actor != 'human':
            raise ValueError('Override records need a human actor')
        if self.verdict in ('fail', 'inconclusive') and self.actor != 'agent':
            raise ValueError('Fail and inconclusive records need an agent actor')
        return self


class ImportQuest(schemas.Input):
    key: schemas.Name
    title: schemas.Name
    home_page: schemas.Name
    description: schemas.Text = ''
    acceptance_criteria: schemas.Text = ''
    icon_name: str = Field(default='compass', description='A bundled icon name or emoji: followed by one Unicode emoji.')
    milestone: bool = False
    work_state: schemas.WorkState = 'not_started'
    completion_state: Literal['none', 'verified', 'overridden'] = 'none'
    verifications: list[ImportVerification] = Field(default_factory=list[ImportVerification])


class ImportDependency(schemas.Input):
    quest: schemas.Name
    depends_on: schemas.Name


class ImportDocument(schemas.Input):
    version: Literal[2]
    project: schemas.CreateProject
    bypass_auto_layout: bool = False
    pages: list[ImportPage] = Field(min_length=1)
    quests: list[ImportQuest]
    dependencies: list[ImportDependency] = Field(default_factory=list[ImportDependency])
    pins: list[schemas.Name] = Field(default_factory=list[str])

    @model_validator(mode='after')
    def validate_graph(self) -> ImportDocument:
        pages = {page.key: page for page in self.pages}
        quests = {quest.key: quest for quest in self.quests}
        if len(pages) != len(self.pages) or len(quests) != len(self.quests):
            raise ValueError('Page and quest keys must be unique')
        for page in self.pages:
            if len(set(page.quests)) != len(page.quests) or any(key not in quests for key in page.quests):
                raise ValueError(f'Page {page.key} has duplicate or unknown quests')
            positioned = [position.quest for position in page.positions]
            if len(set(positioned)) != len(positioned) or any(key not in page.quests for key in positioned):
                raise ValueError(f'Page {page.key} has duplicate or unknown positions')
            if self.bypass_auto_layout and set(positioned) != set(page.quests):
                raise ValueError(f'Page {page.key} needs a position for every quest')
        for quest in self.quests:
            if quest.home_page not in pages or quest.key not in pages[quest.home_page].quests:
                raise ValueError(f'Quest {quest.key} must appear on its home page')
            if not valid_icon(quest.icon_name):
                raise ValueError(f'Quest {quest.key} has an unknown icon')
            if [item.sequence for item in quest.verifications] != list(range(1, len(quest.verifications) + 1)):
                raise ValueError(f'Quest {quest.key} verification sequences must be contiguous')
            completion = next((item for item in reversed(quest.verifications) if item.verdict in ('pass', 'override', 'reopen')), None)
            expected = {'pass': 'verified', 'override': 'overridden', 'reopen': 'none'}.get(completion.verdict) if completion else 'none'
            if quest.completion_state != expected:
                raise ValueError(f'Quest {quest.key} completion state does not match its verification history')
            if len({item.key for q in self.quests for item in q.verifications}) != sum(len(q.verifications) for q in self.quests):
                raise ValueError('Verification keys must be unique')
        edges: set[tuple[str, str]] = set()
        incoming: dict[str, set[str]] = {key: set() for key in quests}
        for edge in self.dependencies:
            pair = (edge.quest, edge.depends_on)
            if edge.quest not in quests or edge.depends_on not in quests or pair in edges:
                raise ValueError('Dependencies must be unique and reference existing quests')
            edges.add(pair)
            incoming[edge.quest].add(edge.depends_on)
        pending = set(quests)
        while pending:
            ready = {key for key in pending if not (incoming[key] & pending)}
            if not ready:
                raise ValueError('Dependencies contain a cycle')
            pending -= ready
        if len(set(self.pins)) != len(self.pins) or any(key not in quests for key in self.pins):
            raise ValueError('Pins must be unique and reference existing quests')
        return self


@services.mutation
def import_project(db: Session, document: ImportDocument) -> Project:
    if any({position.quest for position in page.positions} != set(page.quests) for page in document.pages):
        services.fail('invalid_input', message='Every quest needs a position on every page')
    create_project = cast(Callable[..., Project], unwrap(services.create_project))
    create_page = cast(Callable[..., Page], unwrap(services.create_page))
    create_quest = cast(Callable[..., tuple[Quest, QuestAppearance]], unwrap(services.create_quest))
    add_quest_to_page = cast(Callable[..., QuestAppearance], unwrap(services.add_quest_to_page))
    add_dependency = cast(Callable[..., Dependency], unwrap(services.add_dependency))
    pin_quest = cast(Callable[..., Pin], unwrap(services.pin_quest))
    project = create_project(db, document.project.name, document.project.description)
    db.flush()
    pages: dict[str, Page] = {}
    for page in document.pages:
        pages[page.key] = create_page(db, project.id, page.name, layout=page.layout)
    db.flush()
    quests: dict[str, Quest] = {}
    for quest in document.quests:
        q, _ = create_quest(db, project.id, quest.title, pages[quest.home_page].id, 0, 0,
            description=quest.description, acceptance_criteria=quest.acceptance_criteria,
            icon_name=quest.icon_name, milestone=quest.milestone, work_state=quest.work_state)
        q.completion_state = quest.completion_state
        quests[quest.key] = q
    db.flush()
    for page in document.pages:
        for position in page.positions:
            add_quest_to_page(db, pages[page.key].id, quests[position.quest].id, position.x, position.y)
    db.flush()
    for edge in document.dependencies:
        add_dependency(db, quests[edge.quest].id, quests[edge.depends_on].id)
        db.flush()
    for key in document.pins:
        pin_quest(db, project.id, quests[key].id)
        db.flush()
    verification_ids = {item.key: str(uuid4()) for quest in document.quests for item in quest.verifications}
    def remap_snapshot(value: JSONValue) -> JSONValue:
        if isinstance(value, list):
            return [remap_snapshot(item) for item in value]
        if isinstance(value, dict):
            return {key: (quests[item].id if key == 'questId' and isinstance(item, str) and item in quests
                          else verification_ids[item] if key == 'latestCompletionEventId' and isinstance(item, str) and item in verification_ids
                          else remap_snapshot(item)) for key, item in value.items()}
        return value
    for quest in document.quests:
        for item in quest.verifications:
            db.add(Verification(id=verification_ids[item.key], quest_id=quests[quest.key].id,
                sequence=item.sequence, verdict=item.verdict, actor=item.actor, evidence=item.evidence,
                reasoning=item.reasoning, snapshot_json=json.dumps(remap_snapshot(item.snapshot)), created_at=item.created_at))
    db.flush()
    return project
