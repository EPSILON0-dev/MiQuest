import re
from collections.abc import Callable, Mapping
from typing import cast

from fastapi import APIRouter, Request
from pydantic.alias_generators import to_camel
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from miquest import schemas, services
from miquest.importer import ImportDocument, import_project
from miquest.verification_settings import read_settings, save_settings

type JSONValue = None | bool | int | float | str | list[JSONValue] | dict[str, JSONValue]

router = APIRouter()


@router.post('/imports/preview')
def preview_import(document: ImportDocument) -> dict[str, object]:
    return {'data': {'project': document.project.name, 'pages': [page.name for page in document.pages],
                     'quests': len(document.quests), 'dependencies': len(document.dependencies)}}


@router.post('/imports', status_code=201)
def create_import(request: Request, document: ImportDocument) -> dict[str, object]:
    session_factory = cast(Callable[[], Session], request.app.state.session_factory)
    with session_factory() as db:
        project = import_project(db, document)
        return {'data': {'id': project.id}}


def serialize(db: Session, value: object) -> JSONValue:
    from miquest.models import (
        Base,
        Dependency,
        Pin,
        Quest,
        QuestAppearance,
        Verification,
    )
    if isinstance(value, Quest):
        return serialize(db, services.quest_view(db, value))
    if isinstance(value, dict):
        return {key: serialize(db, item) for key, item in cast(Mapping[str, object], value).items()}
    if isinstance(value, (list, tuple)):
        return [serialize(db, item) for item in cast(list[object], value)]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, QuestAppearance):
        return {'pageId': value.page_id, 'questId': value.quest_id, 'x': value.position_x, 'y': value.position_y}
    if isinstance(value, Dependency):
        return {'questId': value.quest_id, 'dependsOnQuestId': value.depends_on_quest_id}
    if isinstance(value, Pin):
        return {'projectId': value.project_id, 'questId': value.quest_id, 'sortOrder': value.sort_order}
    if isinstance(value, Verification):
        import json
        result = {to_camel(c.key): serialize(db, getattr(value, c.key)) for c in inspect(value).mapper.column_attrs}
        snapshot = result.pop('snapshotJson')
        if not isinstance(snapshot, str):
            raise TypeError('Invalid verification snapshot')
        result['snapshot'] = cast(JSONValue, json.loads(snapshot))
        return result
    if not isinstance(value, Base):
        raise TypeError('Unsupported response value')
    return {to_camel(c.key): serialize(db, getattr(value, c.key)) for c in inspect(value).mapper.column_attrs}


def execute(request: Request, operation: str, body: schemas.Input | None = None, result_kind: str | None = None) -> dict[str, JSONValue]:
    from miquest.models import Page, Project, Quest
    args = dict(request.path_params)
    args = { {'projectId': 'project_id', 'pageId': 'page_id', 'questId': 'quest_id', 'prerequisiteId': 'depends_on_quest_id'}.get(k, k): v for k, v in args.items() }
    session_factory = cast(Callable[[], Session], request.app.state.session_factory)
    with session_factory() as db:
        if request.method == 'GET':
            db.connection().exec_driver_sql('BEGIN')
        project_id = args.get('project_id')
        if not project_id and 'page_id' in args:
            project_id = services.get(db, Page, args['page_id'], 'page_not_found').project_id
        if not project_id and 'quest_id' in args:
            project_id = services.get(db, Quest, args['quest_id'], 'quest_not_found').project_id
        if body is not None:
            fields = body.model_dump(exclude_unset=True)
            if 'icon' in fields:
                fields['icon_name'] = fields.pop('icon')
            args.update(fields)
        if operation == 'get_verification_history':
            try:
                args['after_sequence'] = int(request.query_params.get('afterSequence', '0'))
                args['limit'] = int(request.query_params.get('limit', '50'))
                if args['after_sequence'] < 0 or not 1 <= args['limit'] <= 200:
                    raise ValueError
            except ValueError:
                from miquest.errors import DomainError
                raise DomainError('invalid_input')
        def response_for(result: object) -> dict[str, JSONValue]:
            result_project_id = cast(Project, result).id if operation == 'create_project' else project_id
            if result_kind == 'created_quest':
                items = cast(tuple[object, object], result)
                result = {'quest': items[0], 'appearance': items[1]}
            elif result_kind == 'verification':
                items = cast(tuple[object, object], result)
                result = {'quest': items[0], 'verification': items[1]}
            elif result_kind == 'deleted':
                result = {'deletedId': result}
            elif result_kind == 'unpinned':
                result = {'questId': result}
            response: dict[str, JSONValue] = {'data': serialize(db, result)}
            if result_project_id and operation != 'delete_project':
                response['projectRevision'] = services.project(db, result_project_id).revision
            return response

        captured: list[dict[str, JSONValue]] = []
        if request.method != 'GET':
            def capture(result: object) -> None:
                captured.append(response_for(result))
            db.info['mutation_snapshot'] = capture
        handler = cast(Callable[..., object], getattr(services, operation))
        result = handler(db, **args)
        return captured[0] if captured else response_for(result)



def register(path: str, method: str, operation: str, schema: type[schemas.Input] | None = None, status: int = 200, result_kind: str | None = None) -> None:
    if schema:
        def body_endpoint(request: Request, body: schemas.Input) -> dict[str, JSONValue]:
            return execute(request, operation, body, result_kind)
        body_endpoint.__annotations__['body'] = schema
        endpoint = body_endpoint
    else:
        def read_endpoint(request: Request) -> dict[str, JSONValue]:
            return execute(request, operation, result_kind=result_kind)
        endpoint = read_endpoint
    endpoint.__name__ = operation + '_' + method.lower()
    parameters = [{'name': name, 'in': 'path', 'required': True, 'schema': {'type': 'string', 'format': 'uuid'}} for name in re.findall(r'{([^}]+)}', path)]
    if operation == 'get_verification_history':
        parameters.extend([
            {'name': 'afterSequence', 'in': 'query', 'required': False, 'schema': {'type': 'integer', 'minimum': 0, 'default': 0}},
            {'name': 'limit', 'in': 'query', 'required': False, 'schema': {'type': 'integer', 'minimum': 1, 'maximum': 200, 'default': 50}},
        ])
    router.add_api_route(path, endpoint, methods=[method], status_code=status, openapi_extra={'parameters': parameters})


register('/projects', 'GET', 'list_projects')
register('/projects', 'POST', 'create_project', schemas.CreateProject, 201)
register('/projects/{projectId}', 'GET', 'get_project')
register('/projects/{projectId}', 'PATCH', 'update_project', schemas.UpdateProject)
register('/projects/{projectId}', 'DELETE', 'delete_project', schemas.DeleteRequest, result_kind='deleted')
register('/projects/{projectId}/graph', 'GET', 'get_project_graph')
register('/projects/{projectId}/tree-draft', 'POST', 'save_tree_draft', schemas.TreeDraftRequest)
register('/projects/{projectId}/pages', 'GET', 'list_pages')
register('/projects/{projectId}/pages', 'POST', 'create_page', schemas.PageRequest, 201)
register('/pages/{pageId}', 'GET', 'get_page')
register('/pages/{pageId}', 'PATCH', 'update_page', schemas.PageRequest)
register('/pages/{pageId}', 'DELETE', 'delete_page', schemas.DeletePageRequest, result_kind='deleted')
register('/pages/{pageId}/graph', 'GET', 'get_page_graph')
register('/pages/{pageId}/memberships', 'GET', 'get_page_memberships')
register('/pages/{pageId}/quests/{questId}', 'PUT', 'add_quest_to_page', schemas.PositionRequest)
register('/pages/{pageId}/quests/{questId}', 'PATCH', 'update_quest_appearance', schemas.PositionRequest)
register('/pages/{pageId}/quests/{questId}', 'DELETE', 'remove_quest_from_page', schemas.RemoveAppearance)
register('/pages/{pageId}/positions', 'PUT', 'update_page_positions', schemas.PositionsRequest)
register('/projects/{projectId}/quests', 'GET', 'list_quests')
register('/projects/{projectId}/quests', 'POST', 'create_quest', schemas.CreateQuest, 201, 'created_quest')
register('/quests/{questId}', 'GET', 'get_quest')
register('/quests/{questId}', 'PATCH', 'update_quest', schemas.UpdateQuest)
register('/quests/{questId}', 'DELETE', 'delete_quest', schemas.DeleteRequest, result_kind='deleted')
register('/quests/{questId}/dependencies', 'POST', 'add_dependency', schemas.DependencyRequest, 201)
register('/quests/{questId}/dependencies/{prerequisiteId}', 'DELETE', 'remove_dependency', schemas.RevisionRequest)
register('/projects/{projectId}/pins', 'GET', 'list_pins')
register('/projects/{projectId}/pins/{questId}', 'PUT', 'pin_quest', schemas.RevisionRequest)
register('/projects/{projectId}/pins/{questId}', 'DELETE', 'unpin_quest', schemas.RevisionRequest, result_kind='unpinned')
register('/projects/{projectId}/pin-order', 'PUT', 'reorder_pins', schemas.PinOrderRequest)
register('/quests/{questId}/verifications', 'GET', 'get_verification_history')
register('/quests/{questId}/verifications', 'POST', 'submit_verification', schemas.AgentVerification, 201, 'verification')
register('/quests/{questId}/override', 'POST', 'override_quest', schemas.OverrideRequest, 201, 'verification')
register('/quests/{questId}/reopen', 'POST', 'reopen_quest', schemas.ReopenRequest, 201, 'verification')


@router.get('/icons')
def icons() -> dict[str, object]:
    from miquest.icons import ICON_NAMES
    return {'data': {'defaultIcon': 'compass', 'names': sorted(ICON_NAMES)}}


class VerificationSettings(schemas.Input):
    key: str | None = None
    model: str
    effort: str


@router.get('/verification-settings')
def get_verification_settings(request: Request) -> dict[str, object]:
    return {'data': read_settings(request.app.state.settings_path)}


@router.put('/verification-settings')
def put_verification_settings(request: Request, body: VerificationSettings) -> dict[str, object]:
    from miquest.errors import DomainError
    path = request.app.state.settings_path
    try:
        save_settings(path, key=body.key, model=body.model, effort=body.effort)
    except ValueError:
        raise DomainError('invalid_input') from None
    return {'data': read_settings(path)}
