# Epstein Files research tool

A personal research/study tool for the DOJ's public **Epstein Library** —
released under the *Epstein Files Transparency Act* (signed Nov 19, 2025),
which put out 3.5M+ pages, 180,000+ images, and 2,000+ videos at
`justice.gov/epstein`. This app:

- **Fetches** a curated slice of that public release (by name/keyword search,
  or by dataset) rather than trying to pull all 3.5M pages.
- **Indexes** document text (with OCR fallback for scanned pages) into a
  full-text search index, so you can pull up everything mentioning a given
  name (e.g. "trump").
- **Sequences videos** into a playlist player so you can watch them back to
  back for study, plus an optional script to merge them into one file.

Everything here operates on **public government records**. Nothing is
bundled — you populate `library/` yourself by running the fetcher.

## Known limitation: network access

This was built in a sandboxed environment whose egress policy blocks
`justice.gov` entirely (only GitHub, package registries, and a couple of
other domains are reachable). That means:

- The fetcher code (`fetcher/`) is written from public reporting on the
  DOJ site's structure, **not verified against the live site**.
- Before any bulk run, run `python -m fetcher.probe` from a network that can
  actually reach `justice.gov`, and fix up the selectors in
  `fetcher/crawl_datasets.py` / `fetcher/search_fetch.py` if the real markup
  differs (they use a generic "any link ending in `.pdf`/`.mp4`/etc."
  heuristic, which should be fairly resilient, but the DOJ search results
  may also be JS-rendered — if `probe` finds no links, you'll need a
  headless-browser fetch instead of a plain GET).
- The DOJ site reportedly has an age-gate / access-verification interstitial
  in front of some content; this isn't handled yet and may need a manual
  cookie or confirmation step once you can see the real flow.

Everything else (DB, indexing, search, video player, concat script) was
built and tested end-to-end locally with synthetic sample data.

## Setup

```bash
pip install -r requirements.txt
```

For OCR on scanned documents you also need the `tesseract` binary
(`apt install tesseract-ocr`) and, for scanned PDFs specifically, `poppler`
(`apt install poppler-utils`) so `pdf2image` can rasterize pages.

## Usage

```bash
# 1. Sanity-check the DOJ site structure before a bulk run
python -m fetcher.probe

# 2. Pull a curated set - e.g. everything DOJ's own search surfaces for "trump"
python -m fetcher.search_fetch --query trump --limit 50

# (alternative: crawl specific "Data Set N" pages instead of a name search)
python -m fetcher.crawl_datasets --dataset "Data Set 12" --limit 50

# 3. Build the search index over whatever landed in library/
python -m indexer.build_index

# 4. Run the app
python app/server.py
# -> http://127.0.0.1:5000
#    /search    full-text search over document text
#    /documents browse everything indexed
#    /videos    sequential playlist player (auto-advances, click to jump)

# 5. Optional: merge all videos into a single file instead of using the
#    web playlist (requires the `ffmpeg` binary on PATH)
python -m scripts.concat_videos --out data/compilation.mp4
```

## How it's organized

```
config.py              paths + DOJ URLs
fetcher/
  doj_client.py         rate-limited requests session
  probe.py               run first - dumps page structure for a live sanity check
  search_fetch.py        download items matching a name/keyword search
  crawl_datasets.py      download items from specific "Data Set N" pages
indexer/
  db.py                  SQLite schema + FTS5 full-text search
  extract_text.py        PDF text extraction + OCR fallback
  build_index.py         walk library/, populate the DB and search index
app/
  server.py              Flask app: search, document list, video player
scripts/
  concat_videos.py       ffmpeg concat of all indexed videos into one file
```
