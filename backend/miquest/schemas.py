from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text = Annotated[str, StringConstraints(max_length=100000)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)]
Coordinate = Annotated[float, Field(ge=-1000000, le=1000000, allow_inf_nan=False, strict=True)]
Revision = Annotated[int, Field(ge=0, strict=True)]
Layout = Literal['branching', 'radial', 'spiral']
WorkState = Literal['not_started', 'in_progress', 'blocked']


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', alias_generator=to_camel, populate_by_name=False, strict=True)


class RevisionRequest(Input):
    expected_revision: Revision


class DeleteRequest(RevisionRequest):
    confirm_delete: Literal[True]


class CreateProject(Input):
    name: Name
    description: Text = ''


class UpdateProject(RevisionRequest):
    name: Name | None = None
    description: Text | None = None

    @model_validator(mode='after')
    def has_change(self) -> "UpdateProject":
        if not self.model_fields_set - {'expected_revision'} or any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError('At least one non-null field is required')
        return self


class PageRequest(RevisionRequest):
    name: Name
    layout: Layout | None = None


class PositionRequest(RevisionRequest):
    x: Coordinate
    y: Coordinate


class RemoveAppearance(RevisionRequest):
    new_home_page_id: str | None = None


class Position(Input):
    quest_id: str
    x: Coordinate
    y: Coordinate


class PositionsRequest(RevisionRequest):
    positions: list[Position]


class CreateQuest(PositionRequest):
    title: Name
    page_id: str
    description: Text = ''
    acceptance_criteria: Text = ''
    work_state: WorkState = 'not_started'
    icon: str = 'compass'
    milestone: bool = False


class UpdateQuest(RevisionRequest):
    title: Name | None = None
    description: Text | None = None
    acceptance_criteria: Text | None = None
    work_state: WorkState | None = None
    icon: str | None = None
    milestone: bool | None = None
    home_page_id: str | None = None

    @model_validator(mode='after')
    def has_change(self) -> "UpdateQuest":
        if not self.model_fields_set - {'expected_revision'} or any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError('At least one non-null field is required')
        return self


class DependencyRequest(RevisionRequest):
    depends_on_quest_id: str


class PinOrderRequest(RevisionRequest):
    quest_ids: list[str]


class OverrideRequest(RevisionRequest):
    reason: Reason
    confirm_override: Literal[True]


class ReopenRequest(RevisionRequest):
    reason: Reason


class MoveAction(Input):
    quest_id: str
    action: Literal['move']
    target_page_id: str
    x: Coordinate
    y: Coordinate


class RehomeAction(Input):
    quest_id: str
    action: Literal['rehome']
    target_page_id: str


class DeleteAction(Input):
    quest_id: str
    action: Literal['delete']
    confirm_delete: Literal[True]


class DeletePageRequest(DeleteRequest):
    quest_actions: list[Annotated[MoveAction | RehomeAction | DeleteAction, Field(discriminator='action')]]


class AgentVerification(RevisionRequest):
    verdict: Literal['pass', 'fail', 'inconclusive']
    reasoning: Reason
    evidence: Text = ''


class DraftOperation(Input):
    operation: Literal['update_page', 'create_quest', 'update_quest', 'delete_quest', 'add_quest_to_page',
                       'update_quest_appearance', 'remove_quest_from_page', 'update_page_positions',
                       'add_dependency', 'remove_dependency']
    arguments: dict[str, object]
    client_id: str | None = None


class TreeDraftRequest(RevisionRequest):
    operations: list[DraftOperation]
