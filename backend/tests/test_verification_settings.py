import json
import stat
from pathlib import Path

import pytest

from miquest.verification_settings import read_settings, save_settings


def test_settings_secret_is_private_and_replaceable(tmp_path: Path) -> None:
    path = tmp_path / 'settings.json'
    assert read_settings(path) == {'configured': False, 'keyMask': None, 'model': '', 'effort': ''}
    save_settings(path, key='sk-test-123456789', model='example/model', effort='medium')
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    public = read_settings(path)
    assert public == {'configured': True, 'keyMask': 'key-****23456789', 'model': 'example/model', 'effort': 'medium'}
    assert 'sk-test' not in json.dumps(public)
    save_settings(path, key=None, model='example/other', effort='')
    assert read_settings(path)['keyMask'] == 'key-****23456789'
    save_settings(path, key='', model='', effort='')
    assert read_settings(path)['configured'] is False


def test_settings_reject_invalid_values(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        save_settings(tmp_path / 'settings.json', key='\nsecret', model='', effort='')


def test_short_key_is_not_disclosed(tmp_path: Path) -> None:
    path = tmp_path / 'settings.json'
    save_settings(path, key='secret', model='', effort='')
    assert 'secret' not in str(read_settings(path))
