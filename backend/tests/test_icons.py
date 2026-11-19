import re
from pathlib import Path

from miquest.icons import EMOJI_NAMES, ICON_NAMES


def test_backend_icon_names_match_frontend_registry() -> None:
    source = (Path(__file__).resolve().parents[2] / 'frontend/src/iconNames.ts').read_text()
    registry = source.split('export const icons:', 1)[1].split('};', 1)[0]
    frontend_names = set(re.findall(r'^\s*["\']?([\w-]+)["\']?:', registry, re.MULTILINE))
    assert set(ICON_NAMES) == frontend_names
    assert 'compass' in ICON_NAMES


def test_backend_emoji_names_match_frontend_registry() -> None:
    source = (Path(__file__).resolve().parents[2] / 'frontend/src/iconNames.ts').read_text()
    registry = source.split('export const emojiIcons = [', 1)[1].split(']', 1)[0]
    assert EMOJI_NAMES == {'emoji:' + value for value in re.findall(r'"([^"]+)"', registry)}
    assert 'emoji:🛠️' in EMOJI_NAMES


def test_validate_single_emoji_grapheme() -> None:
    from miquest.icons import valid_icon

    for value in ('emoji:🦊', 'emoji:👍🏽', 'emoji:🇵🇱', 'emoji:👨‍👩‍👧‍👦', 'emoji:1️⃣', 'emoji:🏳️‍🌈'):
        assert valid_icon(value), value
    for value in ('emoji:', 'emoji:hello', 'emoji:😀😀', 'emoji:1', 'emoji:🏽', 'emoji:🇵', 'emoji:😀x'):
        assert not valid_icon(value), value
