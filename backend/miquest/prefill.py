"""Manually load the prototype's sample projects into an empty database."""

import json
from datetime import UTC, datetime, timedelta
from importlib.resources import files
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

from sqlalchemy import select

from .db import check_schema, create_engine_for_path, make_session_factory
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


def load_fixture() -> dict[str, list[dict[str, Any]]]:
    return cast(dict[str, list[dict[str, Any]]], json.loads(files('miquest').joinpath('fixture.json').read_text()))


def prefill_database(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError('Database does not exist; run migrations before prefill.')
    engine = create_engine_for_path(path)
    try:
        with make_session_factory(engine)() as db:
            if not check_schema(db):
                raise RuntimeError('Database schema is incompatible; run migrations before prefill.')
            db.rollback()
            db.connection().exec_driver_sql('BEGIN IMMEDIATE')
            if any(db.scalar(select(table).limit(1)) is not None for table in Base.metadata.tables.values()):
                raise RuntimeError('Database must be empty before prefill.')
            data = load_fixture()
            ids = {row['id']: str(uuid4()) for kind in ('projects', 'pages', 'quests', 'verifications') for row in data[kind]}
            quests = {row['id']: row for row in data['quests']}
            base_time = datetime.now(UTC)
            def ordered_time(index: int) -> str:
                return (base_time + timedelta(microseconds=index)).isoformat(timespec="microseconds").replace("+00:00", "Z")
            timestamp = ordered_time(len(data['quests']))
            db.add_all(Project(id=ids[p['id']], name=p['name'], description=p['description'], created_at=ordered_time(index), updated_at=timestamp) for index, p in enumerate(data['projects']))
            db.flush()
            db.add_all(Page(id=ids[p['id']], project_id=ids[p['projectId']], name=p['name'], created_at=ordered_time(index), updated_at=timestamp) for index, p in enumerate(data['pages']))
            db.flush()
            db.add_all(Quest(id=ids[q['id']], project_id=ids[q['projectId']], title=q['title'], description=q['description'], acceptance_criteria=q['acceptanceCriteria'], work_state=q['workState'], completion_state=q['completionState'], icon_name=q['icon'], milestone=int(q['milestone']), home_page_id=ids[q['homePageId']], created_at=timestamp, updated_at=timestamp) for q in data['quests'])
            db.flush()
            db.add_all(QuestAppearance(page_id=ids[a['pageId']], quest_id=ids[a['questId']], project_id=ids[quests[a['questId']]['projectId']], position_x=a['x'], position_y=a['y']) for a in data['appearances'])
            db.add_all(Dependency(quest_id=ids[d['questId']], depends_on_quest_id=ids[d['dependsOnQuestId']], project_id=ids[quests[d['questId']]['projectId']]) for d in data['dependencies'])
            orders: dict[str, int] = {}
            for pin in data['pins']:
                project_id = ids[pin['projectId']]
                order = orders.get(project_id, 0)
                db.add(Pin(project_id=project_id, quest_id=ids[pin['questId']], sort_order=order))
                orders[project_id] = order + 1
            states: dict[str, str] = {}
            latest: dict[str, str] = {}
            sequences: dict[str, int] = {}
            for event in data['verifications']:
                quest = quests[event['questId']]
                prior: list[dict[str, str | None]] = []
                for edge in data['dependencies']:
                    if edge['questId'] == quest['id']:
                        parent = edge['dependsOnQuestId']
                        prior.append({'questId': ids[parent], 'completionState': states.get(parent, 'none'), 'latestCompletionEventId': latest.get(parent)})
                snapshot = {'title': quest['title'], 'description': quest['description'], 'acceptanceCriteria': quest['acceptanceCriteria'], 'prerequisites': prior}
                quest_id = event['questId']
                sequence = sequences.get(quest_id, 0) + 1
                sequences[quest_id] = sequence
                states[quest_id] = {'pass': 'verified', 'override': 'overridden', 'reopen': 'none'}[event['verdict']]
                latest[quest_id] = ids[event['id']]
                db.add(Verification(id=ids[event['id']], quest_id=ids[quest_id], sequence=sequence, verdict=event['verdict'], actor=event['actor'], evidence=event['evidence'], reasoning=event['reasoning'], snapshot_json=json.dumps(snapshot), created_at=event['createdAt'] + 'T00:00:00Z'))
            db.commit()
    finally:
        engine.dispose()
