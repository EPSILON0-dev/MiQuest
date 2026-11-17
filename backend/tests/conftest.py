"""Tests cannot contact OpenRouter; tests of its adapter supply fake responses."""

from collections.abc import Iterator
from typing import Any

import pytest

from miquest import openrouter


@pytest.fixture(autouse=True)
def mock_openrouter(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> Iterator[None]:
    def forbidden(*_args: object, **_kwargs: object) -> None:
        raise AssertionError('A test attempted an unmocked OpenRouter request')

    monkeypatch.setattr(openrouter, 'urlopen', forbidden)
    if request.path.name != 'test_openrouter.py':
        monkeypatch.setattr(openrouter, 'list_models', lambda: [
            {'id': 'mock/reviewer', 'name': 'Mock reviewer', 'contextLength': 131072,
             'maxOutputTokens': 16384, 'efforts': ['none', 'low', 'medium', 'high']},
        ])
        def complete(body: dict[str, Any], _key: str) -> dict[str, Any]:
            del body
            return {'choices': [{'finish_reason': 'stop', 'message': {'content':
                '{"verdict":"inconclusive","reasoning":"Mock reviewer: no real evaluation was performed.","unmetCriteria":[]}'}}]}
        monkeypatch.setattr(openrouter, 'complete', complete)
    yield
