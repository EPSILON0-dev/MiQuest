from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from miquest.evidence import prepare_evidence


def image_bytes(format: str = 'PNG', *, animated: bool = False) -> bytes:
    image = Image.new('RGBA', (3, 2), (255, 0, 0, 0))
    output = BytesIO()
    if animated:
        image.save(output, format='GIF', save_all=True, append_images=[Image.new('RGBA', (3, 2), 'blue')])
    else:
        image.save(output, format=format)
    return output.getvalue()


def test_text_and_image_are_stored_with_separate_original(tmp_path: Path) -> None:
    original = image_bytes()
    files = prepare_evidence(tmp_path, [('source.bin', [b'hello']), ('photo.txt', [original])])
    assert files[0].media_type == 'text/plain; charset=utf-8'
    assert files[0].retained_path.read_bytes() == b'hello'
    assert files[1].media_type == 'image/png'
    assert files[1].original_path.read_bytes() == original
    with Image.open(files[1].retained_path) as retained:
        assert retained.format == 'JPEG'
        assert retained.size == (3, 2)
        assert retained.convert('RGB').getpixel((0, 0)) == (255, 255, 255)


@pytest.mark.parametrize('content', [b'\x00binary', b'%PDF-1.4\nhello', b'\xff\xfe\x00', image_bytes(animated=True)])
def test_reject_unsupported_content_and_clean_partial_files(tmp_path: Path, content: bytes) -> None:
    with pytest.raises(ValueError):
        prepare_evidence(tmp_path, [('ok.txt', [b'ok']), ('invalid', [content])])
    assert list(tmp_path.iterdir()) == []


def test_limits_checked_while_reading_and_cleanup(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        prepare_evidence(tmp_path, [('large', [b'x' * (10 * 1024 * 1024), b'x'])])
    assert list(tmp_path.iterdir()) == []
    with pytest.raises(ValueError):
        prepare_evidence(tmp_path, [('x', [b'x'])] * 6)
    assert list(tmp_path.iterdir()) == []
    with pytest.raises(ValueError):
        prepare_evidence(tmp_path, [('x', [b'x' * (9 * 1024 * 1024)])] * 3)
    assert list(tmp_path.iterdir()) == []


def test_reject_unsafe_attachment_names(tmp_path: Path) -> None:
    for name in ('../secret.txt', 'line\nbreak.txt', 'x' * 256):
        with pytest.raises(ValueError):
            prepare_evidence(tmp_path, [(name, [b'proof'])])
    assert list(tmp_path.iterdir()) == []
