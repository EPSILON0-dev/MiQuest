import base64
from io import BytesIO

import pytest
from PIL import Image

from miquest.reviewer import build_request, parse_result


def test_request_contains_original_image_and_current_context() -> None:
    buffer = BytesIO()
    Image.new('RGB', (2, 2), 'red').save(buffer, 'PNG')
    original = buffer.getvalue()
    payload = build_request({'title': 'quest', 'previous': {'verdict': 'fail', 'reasoning': 'missing'}}, 'proof', [('proof.png', 'image/png', original)], 'none')
    content = payload['messages'][1]['content']
    assert 'missing' in content[0]['text']
    assert base64.b64decode(content[2]['image_url']['url'].split(',', 1)[1]) == original
    assert payload['max_tokens'] == 16384
    assert payload['response_format']['type'] == 'json_schema'


def test_request_uses_selected_model_and_supported_default_reasoning() -> None:
    payload = build_request({'title': 'quest'}, 'proof', [], 'default', model='vendor/model')
    assert payload['model'] == 'vendor/model'
    assert 'reasoning' not in payload
    assert payload['provider']['require_parameters'] is True
    assert payload['usage']['include'] is True


def test_provider_response_validation_rejects_malformed_or_inconsistent_results() -> None:
    assert parse_result('{"verdict":"inconclusive","reasoning":"not enough","unmetCriteria":["proof"]}').verdict == 'inconclusive'
    for raw in ('{}', '{"verdict":"pass","reasoning":"ok","unmetCriteria":["missing"]}', '{"verdict":"pass","reasoning":"","unmetCriteria":[]}'):
        with pytest.raises(ValueError):
            parse_result(raw)


def test_mock_response_accounting_is_preserved_without_invented_breakdown() -> None:
    from miquest.reviewer import response_accounting

    response = {'id': 'gen-test', 'provider': 'Example Provider', 'model': 'vendor/model-v2', 'usage': {'prompt_tokens': 123, 'completion_tokens': 45,
                 'completion_tokens_details': {'reasoning_tokens': 30}, 'cost': 0.012,
                 'cost_details': {'upstream_inference_prompt_cost': 0.004, 'upstream_inference_completions_cost': 0.006}}}
    assert response_accounting(response) == {'generationId': 'gen-test', 'provider': 'Example Provider', 'servedModel': 'vendor/model-v2', 'inputTokens': 123,
                                              'outputTokens': 45, 'totalCost': 0.012,
                                              'upstreamInputCost': 0.004, 'upstreamOutputCost': 0.006}
    assert response_accounting({'usage': {'cost': None}}) == {}
