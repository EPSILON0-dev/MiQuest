"""Validate evidence and keep original image bytes separate from retained copies."""

import tempfile
import warnings
from collections.abc import Iterable
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_BYTES = 25 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000


@dataclass(frozen=True)
class EvidenceFile:
    name: str
    media_type: str
    size: int
    original_path: Path
    retained_path: Path


def prepare_evidence(directory: Path, uploads: Iterable[tuple[str, Iterable[bytes]]]) -> list[EvidenceFile]:
    """Write validated uploads; caller owns all returned paths and their lifecycle."""
    directory.mkdir(parents=True, exist_ok=True)
    created: list[Path] = []
    result: list[EvidenceFile] = []
    total = 0

    def new_file() -> Path:
        fd, name = tempfile.mkstemp(prefix='evidence-', dir=directory)
        import os
        os.close(fd)
        path = Path(name)
        created.append(path)
        return path

    try:
        for name, chunks in uploads:
            if len(result) == 5:
                raise ValueError('At most five attachments are allowed')
            if not name or len(name) > 255 or '/' in name or '\\' in name or any(ord(char) < 32 or ord(char) == 127 for char in name):
                raise ValueError('Invalid attachment name')
            original = new_file()
            size = 0
            with original.open('wb') as output:
                for chunk in chunks:
                    size += len(chunk)
                    total += len(chunk)
                    if size > MAX_FILE_BYTES or total > MAX_TOTAL_BYTES:
                        raise ValueError('Attachment size limit exceeded')
                    output.write(chunk)
            data = original.read_bytes()
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter('error', Image.DecompressionBombWarning)
                    with Image.open(BytesIO(data), formats=['PNG', 'JPEG', 'GIF', 'WEBP', 'BMP', 'TIFF']) as image:
                        if getattr(image, 'is_animated', False):
                            raise ValueError('Animated images are not supported')
                        if image.width * image.height > MAX_IMAGE_PIXELS:
                            raise ValueError('Image dimensions exceed the limit')
                        media_type = Image.MIME[image.format or '']
                        image.load()
                        oriented = ImageOps.exif_transpose(image).convert('RGBA')
                        flattened = Image.new('RGB', oriented.size, 'white')
                        flattened.paste(oriented, mask=oriented.getchannel('A'))
                        retained = new_file()
                        flattened.save(retained, format='JPEG', quality=85)
            except UnidentifiedImageError:
                if b'%PDF-' in data[:1024]:
                    raise ValueError('PDF files are not supported') from None
                try:
                    decoded = data.decode('utf-8')
                except UnicodeDecodeError:
                    raise ValueError('Only UTF-8 text and static images are supported') from None
                if any(ord(char) < 32 and char not in '\n\r\t' for char in decoded):
                    raise ValueError('Binary files are not supported') from None
                media_type = 'text/plain; charset=utf-8'
                retained = original
            except (OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
                raise ValueError('Invalid or oversized image') from exc
            result.append(EvidenceFile(name=name, media_type=media_type, size=size,
                                       original_path=original, retained_path=retained))
        return result
    except BaseException:
        for path in created:
            path.unlink(missing_ok=True)
        raise
