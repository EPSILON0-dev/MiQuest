"""Local verification settings; public reads never include the credential."""

import json
import os
import tempfile
from pathlib import Path
from typing import TypedDict, cast


class Settings(TypedDict):
    key: str
    model: str
    effort: str


class PublicSettings(TypedDict):
    configured: bool
    keyMask: str | None
    model: str
    effort: str


def load_settings(path: Path) -> Settings:
    if not path.exists():
        return {'key': '', 'model': '', 'effort': ''}
    data: object = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise ValueError('Invalid verification settings')  # noqa: TRY004
    values = cast(dict[str, object], data)
    if any(not isinstance(values.get(k), str) for k in ('key', 'model', 'effort')):
        raise ValueError('Invalid verification settings')
    return cast(Settings, values)


def read_settings(path: Path) -> PublicSettings:
    settings = load_settings(path)
    key = settings['key']
    return {'configured': bool(key), 'keyMask': 'key-****' + (key[-8:] if len(key) > 8 else '') if key else None,
            'model': settings['model'], 'effort': settings['effort']}


def save_settings(path: Path, *, key: str | None, model: str, effort: str) -> None:
    if any(len(value) > 500 or any(ord(c) < 32 for c in value) for value in (key or '', model, effort)):
        raise ValueError('Invalid verification settings')
    previous = load_settings(path)
    settings: Settings = {'key': previous['key'] if key is None else key, 'model': model, 'effort': effort}
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.settings-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(settings, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
