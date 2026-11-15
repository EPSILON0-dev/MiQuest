from pathlib import Path

from pytest import MonkeyPatch

from miquest import services as s
from miquest.db import create_engine_for_path, make_session_factory
from miquest.models import Base


def test_page_graph_includes_shared_memberships_links_and_pins_without_loading_project_graph(
    tmp_path: Path, monkeypatch: MonkeyPatch,
) -> None:
    engine = create_engine_for_path(tmp_path / 'test.sqlite3')
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as db:
        project = s.create_project(db, name='Project')
        first = s.create_page(db, project.id, name='First')
        second = s.create_page(db, project.id, name='Second')
        local, _ = s.create_quest(db, project.id, title='Local', page_id=first.id, x=1, y=2)
        remote, _ = s.create_quest(db, project.id, title='Remote', page_id=second.id, x=3, y=4)
        unrelated, _ = s.create_quest(db, project.id, title='Unrelated', page_id=second.id, x=5, y=6)
        s.add_quest_to_page(db, second.id, local.id, x=7, y=8)
        s.add_dependency(db, local.id, remote.id)
        s.pin_quest(db, project.id, unrelated.id)

        def unexpected_project_graph(*_args: object, **_kwargs: object) -> None:
            raise AssertionError('page read must not load the entire project graph')

        monkeypatch.setattr(s, 'get_project_graph', unexpected_project_graph)
        graph = s.get_page_graph(db, first.id)
        assert [quest['id'] for quest in graph['quests']] == [local.id]
        assert {(a.page_id, a.quest_id) for a in graph['memberships']} == {
            (first.id, local.id), (second.id, local.id),
        }
        assert [(link['direction'], link['remoteQuest']['id']) for link in graph['externalLinks']] == [
            ('prerequisite', remote.id),
        ]
        assert graph['pins'][0]['quest']['id'] == unrelated.id


def test_page_memberships_preview_includes_only_quests_on_target_page(tmp_path: Path) -> None:
    engine = create_engine_for_path(tmp_path / 'preview.sqlite3')
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as db:
        project = s.create_project(db, name='Project')
        first = s.create_page(db, project.id, name='First')
        second = s.create_page(db, project.id, name='Second')
        local, _ = s.create_quest(db, project.id, title='Local', page_id=first.id, x=1, y=2)
        shared, _ = s.create_quest(db, project.id, title='Shared', page_id=first.id, x=3, y=4)
        remote, _ = s.create_quest(db, project.id, title='Remote', page_id=second.id, x=5, y=6)
        s.add_quest_to_page(db, second.id, shared.id, x=7, y=8)

        preview = s.get_page_memberships(db, first.id)
        assert {quest['id'] for quest in preview['quests']} == {local.id, shared.id}
        assert {(a.page_id, a.quest_id, a.position_x) for a in preview['appearances']} == {
            (first.id, local.id, 1), (first.id, shared.id, 3), (second.id, shared.id, 7),
        }
        assert all(quest['id'] != remote.id for quest in preview['quests'])
