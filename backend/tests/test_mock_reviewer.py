import base64
from io import BytesIO

import pytest
from PIL import Image

from miquest.mock_reviewer import build_request, parse_result


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


def test_provider_response_validation_rejects_malformed_or_inconsistent_results() -> None:
    assert parse_result('{"verdict":"inconclusive","reasoning":"not enough","unmetCriteria":["proof"]}').verdict == 'inconclusive'
    for raw in ('{}', '{"verdict":"pass","reasoning":"ok","unmetCriteria":["missing"]}', '{"verdict":"pass","reasoning":"","unmetCriteria":[]}'):
        with pytest.raises(ValueError):
            parse_result(raw)
