"""Literally concatenate every indexed video, in sequence order, into one
merged file - for when you want a single file to scrub through rather than
the web app's playlist player.

Uses ffmpeg's concat demuxer, which stream-copies (no re-encode) when all
inputs share the same codec/resolution; falls back to re-encoding if a
straight copy fails, since DOJ video releases are unlikely to be uniform.

Requires the `ffmpeg` binary on PATH.

Usage:
    python -m scripts.concat_videos --out data/compilation.mp4
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import BASE_DIR
from indexer.db import get_conn, list_videos


def build_concat_list(video_paths, list_file: Path):
    with open(list_file, "w") as f:
        for p in video_paths:
            escaped = str(p).replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")


def concat(video_paths, out_path: Path):
    with tempfile.TemporaryDirectory() as tmp:
        list_file = Path(tmp) / "concat.txt"
        build_concat_list(video_paths, list_file)

        copy_cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(list_file), "-c", "copy", str(out_path),
        ]
        result = subprocess.run(copy_cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return

        print("Stream copy failed (mismatched codecs?) - re-encoding instead. This is slower.")
        print(result.stderr[-2000:])
        reencode_cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(list_file),
            "-c:v", "libx264", "-c:a", "aac", str(out_path),
        ]
        subprocess.run(reencode_cmd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="data/compilation.mp4")
    args = parser.parse_args()

    if not shutil.which("ffmpeg"):
        print("ffmpeg not found on PATH. Install it (e.g. `apt install ffmpeg`) and re-run.")
        raise SystemExit(1)

    with get_conn() as conn:
        videos = list_videos(conn)

    if not videos:
        print("No videos indexed. Run a fetcher script, then python -m indexer.build_index.")
        raise SystemExit(1)

    video_paths = [(BASE_DIR / v["local_path"]).resolve() for v in videos]
    missing = [p for p in video_paths if not p.is_file()]
    if missing:
        print(f"{len(missing)} indexed video(s) missing on disk, e.g. {missing[0]}")
        raise SystemExit(1)

    out_path = (BASE_DIR / args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Concatenating {len(video_paths)} video(s) -> {out_path}")
    concat(video_paths, out_path)
    print("Done.")


if __name__ == "__main__":
    main()
