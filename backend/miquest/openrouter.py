"""Small OpenRouter HTTP adapter; provider error text is never exposed."""

import json
from typing import Any, cast
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .reviewer import response_accounting

BASE = 'https://openrouter.ai/api/v1'
EFFORTS = ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')


class ProviderError(Exception):
    def __init__(self, message: str, usage: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.usage = usage or {}


def _fetch(request: Request, timeout: int = 600) -> dict[str, Any]:
    try:
        with urlopen(request, timeout=timeout) as response:
            data: object = json.loads(response.read())
    except HTTPError as exc:
        try:
            raw: object = json.loads(exc.read())
        except (ValueError, OSError):
            raw = None
        usage = response_accounting(cast(dict[str, Any], raw)) if isinstance(raw, dict) else {}
        message = {400: 'OpenRouter rejected the request; check model settings and context length.',
                   401: 'OpenRouter rejected the API key.', 402: 'OpenRouter reports insufficient credit.',
                   429: 'OpenRouter rate limit reached.'}.get(exc.code, f'OpenRouter request failed (HTTP {exc.code}).')
        raise ProviderError(message, usage) from None
    except (URLError, TimeoutError, OSError):
        raise ProviderError('Could not reach OpenRouter; check the connection and retry.') from None
    except ValueError:
        raise ProviderError('OpenRouter returned an invalid response.') from None
    if not isinstance(data, dict):
        raise ProviderError('OpenRouter returned an invalid response.')
    return cast(dict[str, Any], data)


def list_models() -> list[dict[str, object]]:
    data = _fetch(Request(f'{BASE}/models'), timeout=15)
    if not isinstance(data.get('data'), list):
        raise ProviderError('OpenRouter returned an invalid model catalog.')
    models: list[dict[str, object]] = []
    for item in cast(list[Any], data['data']):
        if not isinstance(item, dict):
            continue
        item = cast(dict[str, Any], item)
        architecture: object = item.get('architecture')
        provider: object = item.get('top_provider')
        if not isinstance(architecture, dict) or not isinstance(provider, dict):
            continue
        modalities = cast(dict[str, Any], architecture).get('input_modalities', [])
        params = item.get('supported_parameters', [])
        context, output = item.get('context_length'), cast(dict[str, Any], provider).get('max_completion_tokens')
        if (not isinstance(item.get('id'), str) or not isinstance(item.get('name'), str)
                or not isinstance(modalities, list) or 'image' not in modalities or 'text' not in modalities
                or not isinstance(params, list) or 'structured_outputs' not in params
                or not isinstance(context, int) or isinstance(context, bool) or context <= 16384
                or not isinstance(output, int) or isinstance(output, bool) or output < 16384):
            continue
        provider_context = cast(dict[str, Any], provider).get('context_length')
        if isinstance(provider_context, int) and not isinstance(provider_context, bool):
            context = min(context, provider_context)
            if context <= 16384:
                continue
        reasoning = item.get('reasoning')
        efforts: list[str] = ['default']
        if isinstance(reasoning, dict):
            reasoning = cast(dict[str, Any], reasoning)
            supported = reasoning.get('supported_efforts', [])
            if supported is None:
                supported = list(EFFORTS)
            if isinstance(supported, list):
                efforts = [effort for effort in EFFORTS if effort in supported and (effort != 'none' or not reasoning.get('mandatory'))]
            if not efforts:
                efforts = ['default']
        models.append({'id': item['id'], 'name': item['name'], 'contextLength': context,
                       'maxOutputTokens': output, 'efforts': efforts})
    return models


def complete(request: dict[str, Any], key: str) -> dict[str, Any]:
    payload = {**request, 'provider': {'require_parameters': True}}
    if payload.get('reasoning') == {'effort': 'default'}:
        payload.pop('reasoning')
    response = _fetch(Request(f'{BASE}/chat/completions', data=json.dumps(payload).encode(),
                              headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}))
    if response.get('error'):
        raise ProviderError('OpenRouter could not complete the review.', response_accounting(response))
    return response
