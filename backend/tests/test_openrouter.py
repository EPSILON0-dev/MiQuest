import io
import json
from email.message import Message
from typing import Self
from urllib.error import HTTPError

import pytest

from miquest import openrouter


class Response(io.BytesIO):
    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


def test_catalog_filters_capabilities(monkeypatch: pytest.MonkeyPatch) -> None:
    good = {'id': 'model', 'name': 'Model', 'context_length': 100000,
            'architecture': {'input_modalities': ['text', 'image']},
            'supported_parameters': ['structured_outputs'],
            'top_provider': {'max_completion_tokens': 20000},
            'reasoning': {'supported_efforts': ['low', 'high'], 'mandatory': True}}
    bad = {**good, 'id': 'no-image', 'architecture': {'input_modalities': ['text']}}
    def catalog(_request: object, **_kwargs: object) -> Response:
        return Response(json.dumps({'data': [good, bad]}).encode())
    monkeypatch.setattr(openrouter, 'urlopen', catalog)
    assert openrouter.list_models() == [{'id': 'model', 'name': 'Model', 'contextLength': 100000,
                                         'maxOutputTokens': 20000, 'efforts': ['low', 'high']}]


def test_completion_request_and_error_accounting(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[object] = []
    def succeed(request: object, **_kwargs: object) -> Response:
        requests.append(request)
        return Response(b'{"id":"gen-123","choices":[],"usage":{"prompt_tokens":2}}')
    monkeypatch.setattr(openrouter, 'urlopen', succeed)
    response = openrouter.complete({'model': 'model', 'response_format': {'type': 'json_schema'}}, 'secret')
    assert response['id'] == 'gen-123'
    request = requests[0]
    assert request.get_header('Authorization') == 'Bearer secret'  # type: ignore[union-attr]
    body = json.loads(request.data)  # type: ignore[union-attr]
    assert body['provider']['require_parameters'] is True

    def failure(request: object, **_kwargs: object) -> Response:
        del request
        raise HTTPError('https://openrouter.ai', 402, 'secret in provider error', Message(), io.BytesIO(b'{"id":"gen-123","usage":{"prompt_tokens":2}}'))
    monkeypatch.setattr(openrouter, 'urlopen', failure)
    with pytest.raises(openrouter.ProviderError) as error:
        openrouter.complete({'model': 'model'}, 'secret')
    assert 'secret' not in str(error.value)
    assert error.value.usage == {'generationId': 'gen-123', 'inputTokens': 2}


def test_reasoning_capabilities_and_invalid_output_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    base = {'id': 'a', 'name': 'A', 'context_length': 100000,
            'architecture': {'input_modalities': ['text', 'image']},
            'supported_parameters': ['structured_outputs'], 'top_provider': {'max_completion_tokens': 16384}}
    items = [base, {**base, 'id': 'b', 'reasoning': {'supported_efforts': None, 'mandatory': True}},
             {**base, 'id': 'c', 'top_provider': {'max_completion_tokens': None}}]
    def catalog(_request: object, **_kwargs: object) -> Response:
        return Response(json.dumps({'data': items}).encode())
    monkeypatch.setattr(openrouter, 'urlopen', catalog)
    models = openrouter.list_models()
    assert [model['id'] for model in models] == ['a', 'b']
    assert models[0]['efforts'] == ['default']
    assert models[1]['efforts'] == ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
