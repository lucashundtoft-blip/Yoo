# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## Current state of the repo

This repository is **almost empty**. The entire working tree is:

```
scripts/concat_videos.py
```

That's it — no `README.md`, no `requirements.txt`, no `.gitignore`, no package
directories. Do not assume any other project structure exists without
checking `ls`/`git ls-tree` first; it's easy to be misled by the git history
described below into thinking there's more here than there is.

### Why it's like this (history)

An earlier commit (`cdd3b91`, "Add Epstein Files research tool: fetcher,
search index, video sequencer") built out a full personal research tool over
the DOJ's public Epstein Library release: a `fetcher/` module, a full-text
`indexer/` with OCR support, a Flask-style `app/` web UI, a `config.py`, and
this `scripts/concat_videos.py` helper.

The repository owner then deliberately removed almost all of it, one file
per commit (24 commits titled "Empty main so the initial PR shows the full
diff"), leaving only `scripts/concat_videos.py` behind. **Treat this as
intentional** — don't resurrect the deleted `fetcher/`, `indexer/`, `app/`,
or `config.py` modules, and don't assume the Epstein Files project is the
active direction for this repo unless the user says so. If you need the old
code for reference, it's recoverable at commit `cdd3b91` via `git show
cdd3b91:<path>`, but ask the user before reintroducing any of it.

### Known breakage

`scripts/concat_videos.py` imports `config.BASE_DIR` and
`indexer.db.get_conn`/`list_videos`, neither of which exist anymore in this
tree — those modules were among the deleted files. **The script cannot
currently run.** If asked to fix or use this script, flag this dependency
gap rather than silently patching around it; the right fix depends on
what the user actually wants the repo to become next (rebuild a minimal
`config.py`/`indexer.db`, rewrite the script to take a plain directory of
video files as input, etc.) — ask rather than guessing.

## What `scripts/concat_videos.py` does (as designed)

Concatenates a set of indexed video files into a single output file using
ffmpeg's concat demuxer:
- Stream-copies (`-c copy`, no re-encode) when inputs share codec/resolution.
- Falls back to re-encoding (`libx264`/`aac`) if the stream copy fails.
- Requires the `ffmpeg` binary on `PATH`.
- Invoked as `python -m scripts.concat_videos --out data/compilation.mp4`.

## Conventions observed in the existing code

- Python 3, standard library only in this file (`argparse`, `subprocess`,
  `tempfile`, `pathlib.Path`, `shutil`).
- Module-level docstring at the top of each script explains purpose, key
  implementation choice (why stream-copy vs. re-encode), and usage example.
- Scripts are runnable via `python -m scripts.<name>` and manipulate
  `sys.path` to import sibling top-level packages (`config`, `indexer`).
- Fail fast with a printed message and `raise SystemExit(1)` for
  user-actionable problems (missing binary, missing data) rather than
  raising a traceback.
- No test suite, no CI config, no linter config currently in the repo.

## Git workflow

- `main` is the default branch.
- Work happens on branches named `claude/<short-slug>`.
- Commit messages are a short imperative summary line, optionally followed
  by a blank line and a paragraph of context/rationale.

## Working in this repo

- Before adding new modules, check whether the user wants a fresh start or
  wants the deleted Epstein Files tool rebuilt — don't assume either way.
- Keep changes minimal and match the existing style (docstring header,
  stdlib-first, explicit error messages) rather than introducing new
  frameworks or abstractions for a one-script repo.
- There's no dependency manifest right now — if you add code that needs
  third-party packages, add a `requirements.txt` at that point rather than
  assuming one is coming back.
