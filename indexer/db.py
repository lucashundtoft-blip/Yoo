import sqlite3
from contextlib import contextmanager
from html import escape

from config import DB_PATH

_SNIPPET_START = "\x01"
_SNIPPET_END = "\x02"

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('document', 'video')),
    title TEXT NOT NULL,
    dataset TEXT,
    source_url TEXT,
    local_path TEXT NOT NULL UNIQUE,
    mime_type TEXT,
    release_date TEXT,
    sequence_order INTEGER,
    text_extracted INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind);
CREATE INDEX IF NOT EXISTS idx_items_sequence ON items(kind, sequence_order, id);

CREATE VIRTUAL TABLE IF NOT EXISTS item_text USING fts5(
    body,
    tokenize='porter unicode61'
);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def upsert_item(conn, *, kind, title, local_path, dataset=None, source_url=None,
                 mime_type=None, release_date=None, sequence_order=None):
    cur = conn.execute(
        """
        INSERT INTO items (kind, title, dataset, source_url, local_path, mime_type,
                            release_date, sequence_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(local_path) DO UPDATE SET
            title=excluded.title,
            dataset=excluded.dataset,
            source_url=excluded.source_url,
            mime_type=excluded.mime_type,
            release_date=excluded.release_date,
            sequence_order=excluded.sequence_order
        """,
        (kind, title, dataset, source_url, local_path, mime_type, release_date, sequence_order),
    )
    row = conn.execute("SELECT id FROM items WHERE local_path = ?", (local_path,)).fetchone()
    return row["id"]


def set_item_text(conn, item_id, body):
    conn.execute("DELETE FROM item_text WHERE rowid = ?", (item_id,))
    conn.execute("INSERT INTO item_text (rowid, body) VALUES (?, ?)", (item_id, body))
    conn.execute("UPDATE items SET text_extracted = 1 WHERE id = ?", (item_id,))


def search_documents(conn, query, limit=50):
    # Snippet is wrapped with non-HTML control-char markers, then HTML-escaped
    # as a whole before the markers become <mark> tags below - the matched
    # text comes from arbitrary (OCR'd / downloaded) document content, so it
    # must never be interpolated into a template unescaped.
    sql = f"""
        SELECT items.*,
               snippet(item_text, 0, '{_SNIPPET_START}', '{_SNIPPET_END}', '…', 12) AS raw_snippet
        FROM item_text
        JOIN items ON items.id = item_text.rowid
        WHERE item_text MATCH ?
        ORDER BY rank
        LIMIT ?
    """
    rows = conn.execute(sql, (query, limit)).fetchall()
    results = []
    for row in rows:
        d = dict(row)
        escaped = escape(d.pop("raw_snippet") or "")
        d["snippet_html"] = (
            escaped.replace(_SNIPPET_START, "<mark>").replace(_SNIPPET_END, "</mark>")
        )
        results.append(d)
    return results


def list_videos(conn):
    return conn.execute(
        "SELECT * FROM items WHERE kind = 'video' ORDER BY sequence_order IS NULL, sequence_order, release_date, id"
    ).fetchall()


def list_documents(conn, limit=200):
    return conn.execute(
        "SELECT * FROM items WHERE kind = 'document' ORDER BY release_date, id LIMIT ?", (limit,)
    ).fetchall()
