"""Discover DOJ 'Data Set N' pages linked from the disclosures index and
download their listed documents/videos. Same generic link-extraction
heuristic and same live-untested caveat as search_fetch.py - run
`python -m fetcher.probe` first.

Usage:
    python -m fetcher.crawl_datasets --limit 50
    python -m fetcher.crawl_datasets --dataset "Data Set 12" --limit 50
"""
import argparse
import urllib.parse
from pathlib import Path

from bs4 import BeautifulSoup

from config import DOCUMENTS_DIR, DOJ_EPSTEIN_DISCLOSURES, VIDEOS_DIR
from fetcher.doj_client import DojClient
from fetcher.search_fetch import find_result_links


def find_dataset_pages(html: str, base_url: str):
    soup = BeautifulSoup(html, "html.parser")
    pages = []
    for a in soup.find_all("a", href=True):
        text = a.get_text(strip=True)
        if "data set" in text.lower():
            pages.append((text, urllib.parse.urljoin(base_url, a["href"])))
    return pages


def crawl(limit: int, dataset_filter: str | None = None):
    client = DojClient()
    resp = client.get(DOJ_EPSTEIN_DISCLOSURES)
    dataset_pages = find_dataset_pages(resp.text, DOJ_EPSTEIN_DISCLOSURES)

    if not dataset_pages:
        print(
            "No 'Data Set N' links found on the disclosures index page. "
            "Site structure may differ from what this module expects - "
            "run python -m fetcher.probe and update find_dataset_pages()."
        )
        return []

    if dataset_filter:
        dataset_pages = [p for p in dataset_pages if dataset_filter.lower() in p[0].lower()]

    downloaded = []
    for name, page_url in dataset_pages:
        if len(downloaded) >= limit:
            break
        print(f"\n=== {name}: {page_url} ===")
        page_resp = client.get(page_url)
        for kind, href, text in find_result_links(page_resp.text, page_url):
            if len(downloaded) >= limit:
                break
            filename = Path(urllib.parse.urlparse(href).path).name or f"item-{len(downloaded)}"
            dest_dir = (DOCUMENTS_DIR if kind == "document" else VIDEOS_DIR) / name.replace(" ", "-")
            dest_path = dest_dir / filename
            print(f"  [{kind}] {text[:60]!r} -> {dest_path}")
            client.download_to(href, dest_path)
            downloaded.append((kind, href, str(dest_path)))

    return downloaded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=50, help="Max items to download total")
    parser.add_argument("--dataset", default=None, help="Only crawl dataset pages matching this text")
    args = parser.parse_args()

    results = crawl(args.limit, args.dataset)
    print(f"\nDownloaded {len(results)} item(s).")
    print("Next: python -m indexer.build_index")


if __name__ == "__main__":
    main()
