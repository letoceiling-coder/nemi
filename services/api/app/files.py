"""Text from attached files (PDF, Word, plain text) so the assistant really reads what the user attaches."""
from __future__ import annotations
import base64
import binascii
import io
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import current_user

log = logging.getLogger("pai.files")
router = APIRouter(prefix="/api/v1")
MAX_BYTES = 15 * 1024 * 1024
MAX_CHARS = 60_000
TEXT_EXT = {"txt", "md", "csv", "tsv", "json", "xml", "html", "htm", "log", "ini", "yaml", "yml", "py", "js", "ts", "tsx",
            "jsx", "css", "sql", "php", "java", "cs", "go", "rs", "sh", "ps1", "bat", "rtf"}


class FileIn(BaseModel):
    name: str = Field(max_length=300)
    data: str                     # base64


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1251"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def extract(name: str, raw: bytes) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext == "pdf":
        from pypdf import PdfReader
        r = PdfReader(io.BytesIO(raw))
        return "\n\n".join((p.extract_text() or "").strip() for p in r.pages).strip()
    if ext == "docx":
        import docx
        d = docx.Document(io.BytesIO(raw))
        parts = [p.text for p in d.paragraphs]
        for t in d.tables:
            for row in t.rows:
                parts.append(" | ".join(c.text.strip() for c in row.cells))
        return "\n".join(parts).strip()
    if ext in TEXT_EXT or not ext:
        return _decode(raw).strip()
    raise ValueError(f"формат .{ext} пока не читается — поддерживаются PDF, Word (.docx) и текстовые файлы")


@router.post("/files/extract")
def extract_file(b: FileIn, uid: str = Depends(current_user)):
    try:
        raw = base64.b64decode(b.data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "Файл повреждён")
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Файл больше 15 МБ")
    try:
        text = extract(b.name, raw)
    except ValueError as e:
        raise HTTPException(415, str(e))
    except Exception:  # noqa: BLE001 — broken or encrypted document
        log.warning("extract failed for .%s", b.name.rsplit(".", 1)[-1], exc_info=True)
        raise HTTPException(422, "Не удалось прочитать файл (повреждён или защищён паролем)")
    if not text:
        raise HTTPException(422, "В файле нет текста (возможно, это скан — распознавание сканов появится позже)")
    return {"name": b.name, "text": text[:MAX_CHARS], "chars": len(text), "truncated": len(text) > MAX_CHARS}
