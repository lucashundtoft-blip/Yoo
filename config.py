from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
LIBRARY_DIR = BASE_DIR / "library"
DOCUMENTS_DIR = LIBRARY_DIR / "documents"
VIDEOS_DIR = LIBRARY_DIR / "videos"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "index.sqlite3"

# Base URLs for the DOJ's public "Epstein Library", published under the
# Epstein Files Transparency Act (Nov 2025). Verify these paths against the
# live site before relying on them - this fetcher was written without network
# access to justice.gov (blocked by this sandbox's egress policy) and the
# selectors in fetcher/crawl_datasets.py are a best-effort based on published
# reporting, not a tested scrape.
DOJ_EPSTEIN_ROOT = "https://www.justice.gov/epstein"
DOJ_EPSTEIN_SEARCH = "https://www.justice.gov/epstein/search"
DOJ_EPSTEIN_DISCLOSURES = "https://www.justice.gov/epstein/doj-disclosures"

REQUEST_TIMEOUT = 30
REQUEST_DELAY_SECONDS = 1.0  # be polite - this is a government site under heavy load
USER_AGENT = "Mozilla/5.0 (compatible; personal-research-tool/0.1)"

for d in (DOCUMENTS_DIR, VIDEOS_DIR, DATA_DIR):
    d.mkdir(parents=True, exist_ok=True)
