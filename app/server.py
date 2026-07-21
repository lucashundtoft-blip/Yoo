import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flask import Flask, abort, render_template, request, send_from_directory

from config import LIBRARY_DIR
from indexer.db import get_conn, init_db, list_documents, list_videos, search_documents

app = Flask(__name__)
init_db()


@app.route("/")
def home():
    with get_conn() as conn:
        video_count = conn.execute("SELECT COUNT(*) c FROM items WHERE kind='video'").fetchone()["c"]
        doc_count = conn.execute("SELECT COUNT(*) c FROM items WHERE kind='document'").fetchone()["c"]
        indexed_count = conn.execute(
            "SELECT COUNT(*) c FROM items WHERE kind='document' AND text_extracted=1"
        ).fetchone()["c"]
    return render_template(
        "home.html", video_count=video_count, doc_count=doc_count, indexed_count=indexed_count
    )


@app.route("/search")
def search():
    query = request.args.get("q", "").strip()
    results = []
    if query:
        with get_conn() as conn:
            results = search_documents(conn, query)
    return render_template("search.html", query=query, results=results)


@app.route("/documents")
def documents():
    with get_conn() as conn:
        docs = list_documents(conn)
    return render_template("documents.html", documents=docs)


@app.route("/videos")
def videos():
    with get_conn() as conn:
        vids = list_videos(conn)
    return render_template("videos.html", videos=vids)


@app.route("/file/<path:relpath>")
def serve_file(relpath):
    # local_path values stored in the DB are "library/documents/..." or
    # "library/videos/...", relative to the project root - resolve against
    # LIBRARY_DIR's parent and then require the result stay inside LIBRARY_DIR,
    # so path traversal can't reach source files elsewhere in the repo.
    full_path = (LIBRARY_DIR.parent / relpath).resolve()
    if LIBRARY_DIR not in full_path.parents:
        abort(403)
    if not full_path.is_file():
        abort(404)
    return send_from_directory(full_path.parent, full_path.name)


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
