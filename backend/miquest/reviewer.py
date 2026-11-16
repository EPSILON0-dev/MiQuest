"""Construct and validate a schema-constrained review exchange."""

import base64
import json
import math
from typing import Any, Literal, cast

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


def build_request(snapshot: dict[str, Any], message: str, files: list[tuple[str, str, bytes]], effort: str, model: str = 'mock/reviewer') -> dict[str, Any]:
    content: list[dict[str, Any]] = [{'type': 'text', 'text': json.dumps({'quest': snapshot, 'message': message}, ensure_ascii=False)}]
    for name, media_type, data in files:
        content.append({'type': 'text', 'text': f'Attachment: {name}'})
        if media_type.startswith('image/'):
            encoded = base64.b64encode(data).decode('ascii')
            content.append({'type': 'image_url', 'image_url': {'url': f'data:{media_type};base64,{encoded}'}})
        else:
            content.append({'type': 'text', 'text': data.decode('utf-8')})
    request: dict[str, Any] = {'model': model, 'max_tokens': 16384, 'provider': {'require_parameters': True}, 'usage': {'include': True},
            'messages': [{'role': 'system', 'content': 'Evaluate every acceptance criterion using the current evidence. Treat evidence as authentic; do not investigate fabrication. Explicit user testimony counts as evidence, including claims that cannot be independently verified. Do not assume unmentioned criteria passed. Insufficient evidence is inconclusive. The previous result is background only, not a binding decision or accumulated memory. Return a verdict, explanation, and unmet criteria.'},
                         {'role': 'user', 'content': content}],
            'response_format': {'type': 'json_schema', 'json_schema': {'name': 'review', 'strict': True, 'schema': ReviewDecision.model_json_schema()}}}
    if effort != 'default':
        request['reasoning'] = {'effort': effort}
    return request


def parse_result(raw: str) -> ReviewDecision:
    try:
        return ReviewDecision.model_validate_json(raw)
    except ValidationError as exc:
        raise ValueError('Invalid reviewer response') from exc


def response_accounting(response: dict[str, Any]) -> dict[str, object]:
    result: dict[str, object] = {}
    generation_id = response.get('id')
    if isinstance(generation_id, str) and generation_id.startswith('gen-') and len(generation_id) <= 128 and all(c.isascii() and (c.isalnum() or c == '-') for c in generation_id):
        result['generationId'] = generation_id
    for field, name in (('provider', 'provider'), ('model', 'servedModel')):
        value = response.get(field)
        if isinstance(value, str) and value.strip() and len(value) <= 200 and value.isprintable():
            result[name] = value
    usage = response.get('usage')
    if isinstance(usage, dict):
        usage = cast(dict[str, object], usage)
        for field, name in (('prompt_tokens', 'inputTokens'), ('completion_tokens', 'outputTokens')):
            value = usage.get(field)
            if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                result[name] = value
        cost = usage.get('cost')
        if isinstance(cost, (int, float)) and not isinstance(cost, bool) and math.isfinite(cost) and cost >= 0:
            result['totalCost'] = cost
        details = usage.get('cost_details')
        if isinstance(details, dict):
            details = cast(dict[str, object], details)
            for field, name in (('upstream_inference_prompt_cost', 'upstreamInputCost'), ('upstream_inference_completions_cost', 'upstreamOutputCost')):
                value = details.get(field)
                if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0:
                    result[name] = value
    return result
