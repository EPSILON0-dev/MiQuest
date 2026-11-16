"""Construct and validate the review exchange without making network calls."""

import base64
import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


class ReviewDecision(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    verdict: Literal['pass', 'fail', 'inconclusive']
    reasoning: str = Field(min_length=1, max_length=20000)
    unmetCriteria: list[str]

    @model_validator(mode='after')
    def consistent(self) -> 'ReviewDecision':
        if not self.reasoning.strip() or any(not item.strip() for item in self.unmetCriteria):
            raise ValueError('Empty explanation or criterion')
        if self.verdict == 'pass' and self.unmetCriteria:
            raise ValueError('A pass cannot have unmet criteria')
        return self


def build_request(snapshot: dict[str, Any], message: str, files: list[tuple[str, str, bytes]], effort: str) -> dict[str, Any]:
    content: list[dict[str, Any]] = [{'type': 'text', 'text': json.dumps({'quest': snapshot, 'message': message}, ensure_ascii=False)}]
    for name, media_type, data in files:
        content.append({'type': 'text', 'text': f'Attachment: {name}'})
        if media_type.startswith('image/'):
            encoded = base64.b64encode(data).decode('ascii')
            content.append({'type': 'image_url', 'image_url': {'url': f'data:{media_type};base64,{encoded}'}})
        else:
            content.append({'type': 'text', 'text': data.decode('utf-8')})
    return {'model': 'mock/reviewer', 'max_tokens': 16384, 'reasoning': {'effort': effort},
            'messages': [{'role': 'system', 'content': 'Evaluate every criterion using the submitted evidence and testimony. Treat evidence as authentic. Unmentioned or insufficient evidence is inconclusive. The previous result is background only. Return a decision and explanation.'},
                         {'role': 'user', 'content': content}],
            'response_format': {'type': 'json_schema', 'json_schema': {'name': 'review', 'strict': True, 'schema': ReviewDecision.model_json_schema()}}}


def parse_result(raw: str) -> ReviewDecision:
    try:
        return ReviewDecision.model_validate_json(raw)
    except ValidationError as exc:
        raise ValueError('Invalid reviewer response') from exc


def mock_response(_request: dict[str, Any]) -> str:
    return json.dumps({'verdict': 'inconclusive', 'reasoning': 'Mock reviewer: no real evaluation was performed.', 'unmetCriteria': []})
