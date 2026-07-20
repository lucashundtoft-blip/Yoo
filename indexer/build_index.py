"""Walk library/documents and library/videos, register everything in the DB,
and extract+index text for documents so they're searchable.

Usage:
    python -m indexer.build_index
"""
import mimetypes
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import DOCUMENTS_DIR, VIDEOS_DIR
from indexer.db import get_conn, init_db, upsert_item, set_item_text
from indexer.extract_text import extract_text

VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
DOC_SUFFIXES = {".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg", ".tif", ".tiff"}


def _title_from_path(path: Path) -> str:
    return path.stem.replace("_", " ").replace("-", " ").strip()


def index_documents(conn):
    count = 0
    for path in sorted(DOCUMENTS_DIR.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in DOC_SUFFIXES:
            continue
        mime_type, _ = mimetypes.guess_type(str(path))
        dataset = path.parent.name if path.parent != DOCUMENTS_DIR else None
        item_id = upsert_item(
            conn,
            kind="document",
            title=_title_from_path(path),
            local_path=str(path.relative_to(DOCUMENTS_DIR.parent.parent)),
            dataset=dataset,
            mime_type=mime_type,
        )
        text = extract_text(path)
        if text.strip():
            set_item_text(conn, item_id, text)
        count += 1
    return count


def index_videos(conn):
    count = 0
    for order, path in enumerate(sorted(VIDEOS_DIR.rglob("*"))):
        if not path.is_file() or path.suffix.lower() not in VIDEO_SUFFIXES:
            continue
        mime_type, _ = mimetypes.guess_type(str(path))
        dataset = path.parent.name if path.parent != VIDEOS_DIR else None
        upsert_item(
            conn,
            kind="video",
            title=_title_from_path(path),
            local_path=str(path.relative_to(VIDEOS_DIR.parent.parent)),
            dataset=dataset,
            mime_type=mime_type,
            sequence_order=order,
        )
        count += 1
    return count


def main():
    init_db()
    with get_conn() as conn:
        docs = index_documents(conn)
        vids = index_videos(conn)
    print(f"Indexed {docs} document(s) and {vids} video(s).")


if __name__ == "__main__":
    main()
