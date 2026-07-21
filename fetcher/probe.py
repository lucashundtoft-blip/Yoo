"""Run this FIRST, from a network that can actually reach justice.gov, before
trusting any bulk fetch. It fetches the landing/search pages and prints a
summary of what it finds, so you can sanity-check (and fix, if needed) the
CSS selectors used in crawl_datasets.py and search_fetch.py.

Usage:
    python -m fetcher.probe
"""
from bs4 import BeautifulSoup

from config import DOJ_EPSTEIN_DISCLOSURES, DOJ_EPSTEIN_ROOT, DOJ_EPSTEIN_SEARCH
from fetcher.doj_client import DojClient


def probe(url):
    print(f"\n=== {url} ===")
    client = DojClient()
    try:
        resp = client.get(url)
    except Exception as exc:
        print(f"  FAILED: {exc}")
        return
    soup = BeautifulSoup(resp.text, "html.parser")
    title = soup.title.string.strip() if soup.title and soup.title.string else "(no title)"
    print(f"  status={resp.status_code} title={title!r}")

    links = soup.find_all("a", href=True)
    print(f"  {len(links)} <a> tags found. Sample hrefs:")
    for a in links[:20]:
        print(f"    {a['href']!r}  text={a.get_text(strip=True)[:60]!r}")


if __name__ == "__main__":
    for u in (DOJ_EPSTEIN_ROOT, DOJ_EPSTEIN_DISCLOSURES, DOJ_EPSTEIN_SEARCH):
        probe(u)
