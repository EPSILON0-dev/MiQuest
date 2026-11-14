import re
from pathlib import Path

from miquest.icons import ICON_NAMES


def test_backend_icon_names_match_frontend_registry() -> None:
    source = (Path(__file__).resolve().parents[2] / 'frontend/src/iconNames.ts').read_text()
    registry = source.split('export const icons:', 1)[1].split('};', 1)[0]
    frontend_names = set(re.findall(r'^\s*["\']?([\w-]+)["\']?:', registry, re.MULTILINE))
    assert set(ICON_NAMES) == frontend_names
    assert 'compass' in ICON_NAMES
