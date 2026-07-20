"""Targeted fetch: search the DOJ Epstein Library for a name/keyword and
download the matching documents/videos, instead of pulling the entire
multi-million-page release.

This is the "small curated set" path - e.g. `--query trump` should get you
just the items DOJ's own search surfaces for that name, tagged so the app
can filter on them directly.

Parsing here uses a *generic* heuristic (any link ending in a known document
or video extension) rather than guessing DOJ's exact CSS classes, since this
was written without live access to the site to inspect real markup. Run
`python -m fetcher.probe` first - if result links don't show up, the search
results may be rendered client-side (JS), in which case this module will
need a headless-browser fetch (e.g. Playwright, already available in this
environment) instead of a plain GET.

Usage:
    python -m fetcher.search_fetch --query trump --limit 25
"""
import argparse
import urllib.parse
from pathlib import Path

from bs4 import BeautifulSoup

from config import DOCUMENTS_DIR, DOJ_EPSTEIN_SEARCH, VIDEOS_DIR
from fetcher.doj_client import DojClient

DOC_EXTENSIONS = (".pdf", ".txt", ".png", ".jpg", ".jpeg", ".tif", ".tiff")
VIDEO_EXTENSIONS = (".mp4", ".mov", ".m4v", ".webm")


def find_result_links(html: str, base_url: str):
    soup = BeautifulSoup(html, "html.parser")
    found = []
    for a in soup.find_all("a", href=True):
        href = urllib.parse.urljoin(base_url, a["href"])
        lower = href.lower()
        if lower.endswith(DOC_EXTENSIONS):
            found.append(("document", href, a.get_text(strip=True)))
        elif lower.endswith(VIDEO_EXTENSIONS):
            found.append(("video", href, a.get_text(strip=True)))
    return found


def find_next_page(html: str, base_url: str):
    soup = BeautifulSoup(html, "html.parser")
    next_link = soup.find("a", rel="next") or soup.find(
        "a", string=lambda s: s and s.strip().lower() in {"next", "next page", "»"}
    )
    if next_link and next_link.get("href"):
        return urllib.parse.urljoin(base_url, next_link["href"])
    return None


def fetch_by_query(query: str, limit: int, max_pages: int = 10):
    client = DojClient()
    url = f"{DOJ_EPSTEIN_SEARCH}?{urllib.parse.urlencode({'q': query})}"

    downloaded = []
    seen_urls = set()
    page = 0
    while url and page < max_pages and len(downloaded) < limit:
        page += 1
        resp = client.get(url)
        results = find_result_links(resp.text, url)
        if page == 1 and not results:
            print(
                "No document/video links found on the first results page. "
                "The search results may be JS-rendered - see the module "
                "docstring for next steps."
            )

        for kind, href, text in results:
            if href in seen_urls or len(downloaded) >= limit:
                continue
            seen_urls.add(href)
            filename = Path(urllib.parse.urlparse(href).path).name or f"item-{len(downloaded)}"
            dest_dir = (DOCUMENTS_DIR if kind == "document" else VIDEOS_DIR) / f"query-{query}"
            dest_path = dest_dir / filename
            print(f"  [{kind}] {text[:60]!r} -> {dest_path}")
            client.download_to(href, dest_path)
            downloaded.append((kind, href, str(dest_path)))

        url = find_next_page(resp.text, url)

    return downloaded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", required=True, help="Name or keyword to search for, e.g. 'trump'")
    parser.add_argument("--limit", type=int, default=25, help="Max items to download")
    args = parser.parse_args()

    results = fetch_by_query(args.query, args.limit)
    print(f"\nDownloaded {len(results)} item(s) for query {args.query!r}.")
    print("Next: python -m indexer.build_index")


if __name__ == "__main__":
    main()
