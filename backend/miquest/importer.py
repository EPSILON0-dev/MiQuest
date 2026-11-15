from collections.abc import Callable
from inspect import unwrap
from typing import Any, Literal, cast

from pydantic import Field, model_validator
from sqlalchemy.orm import Session

from . import schemas, services
from .icons import ICON_NAMES
from .models import Dependency, Page, Pin, Project, Quest, QuestAppearance


class ImportPage(schemas.Input):
    key: schemas.Name
    name: schemas.Name
    quests: list[schemas.Name]


class ImportQuest(schemas.Input):
    key: schemas.Name
    title: schemas.Name
    home_page: schemas.Name
    description: schemas.Text = ''
    acceptance_criteria: schemas.Text = ''
    icon_name: str = Field(default='compass', json_schema_extra=cast(dict[str, Any], {'enum': sorted(ICON_NAMES)}))
    milestone: bool = False


class ImportDependency(schemas.Input):
    quest: schemas.Name
    depends_on: schemas.Name


class ImportDocument(schemas.Input):
    version: Literal[1]
    project: schemas.CreateProject
    pages: list[ImportPage] = Field(min_length=1)
    quests: list[ImportQuest]
    dependencies: list[ImportDependency] = Field(default_factory=list[ImportDependency])
    pins: list[schemas.Name] = Field(default_factory=list[str])

    @model_validator(mode='after')
    def validate_graph(self) -> 'ImportDocument':
        pages = {page.key: page for page in self.pages}
        quests = {quest.key: quest for quest in self.quests}
        if len(pages) != len(self.pages) or len(quests) != len(self.quests):
            raise ValueError('Page and quest keys must be unique')
        for page in self.pages:
            if len(set(page.quests)) != len(page.quests) or any(key not in quests for key in page.quests):
                raise ValueError(f'Page {page.key} has duplicate or unknown quests')
        for quest in self.quests:
            if quest.home_page not in pages or quest.key not in pages[quest.home_page].quests:
                raise ValueError(f'Quest {quest.key} must appear on its home page')
            if quest.icon_name not in ICON_NAMES:
                raise ValueError(f'Quest {quest.key} has an unknown icon')
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
        pages[page.key] = create_page(db, project.id, page.name)
    db.flush()
    quests: dict[str, Quest] = {}
    for quest in document.quests:
        q, _ = create_quest(db, project.id, quest.title, pages[quest.home_page].id, 0, 0,
            description=quest.description, acceptance_criteria=quest.acceptance_criteria,
            icon_name=quest.icon_name, milestone=quest.milestone)
        quests[quest.key] = q
    db.flush()
    levels: dict[str, int] = {}
    pending = {quest.key for quest in document.quests}
    prerequisites = {key: {edge.depends_on for edge in document.dependencies if edge.quest == key} for key in pending}
    while pending:
        ready = sorted(key for key in pending if prerequisites[key] <= levels.keys())
        for key in ready:
            levels[key] = max((levels[prerequisite] + 1 for prerequisite in prerequisites[key]), default=0)
        pending.difference_update(ready)
    for page in document.pages:
        rows: dict[int, int] = {}
        for key in page.quests:
            level = levels[key]
            row = rows.get(level, 0)
            rows[level] = row + 1
            add_quest_to_page(db, pages[page.key].id, quests[key].id, level * 160, row * 140)
    db.flush()
    for edge in document.dependencies:
        add_dependency(db, quests[edge.quest].id, quests[edge.depends_on].id)
        db.flush()
    for key in document.pins:
        pin_quest(db, project.id, quests[key].id)
        db.flush()
    return project
