"""Thin, polite HTTP client for justice.gov.

NOTE: written without live network access to justice.gov (this sandbox's
egress policy blocks it - see README). The request shape here is standard
`requests` usage and will work against any reachable host; what's unverified
is the *page structure* the other fetcher modules parse. Run
`python -m fetcher.probe` first against a real network to confirm/fix the
selectors in crawl_datasets.py and search_fetch.py before trusting a bulk run.
"""
import time

import requests

from config import REQUEST_DELAY_SECONDS, REQUEST_TIMEOUT, USER_AGENT

_last_request_at = 0.0


class DojClient:
    def __init__(self, delay_seconds: float = REQUEST_DELAY_SECONDS):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.delay_seconds = delay_seconds

    def _throttle(self):
        global _last_request_at
        elapsed = time.monotonic() - _last_request_at
        if elapsed < self.delay_seconds:
            time.sleep(self.delay_seconds - elapsed)
        _last_request_at = time.monotonic()

    def get(self, url, **kwargs):
        self._throttle()
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        resp = self.session.get(url, **kwargs)
        resp.raise_for_status()
        return resp

    def download_to(self, url, dest_path, **kwargs):
        self._throttle()
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        with self.session.get(url, stream=True, **kwargs) as resp:
            resp.raise_for_status()
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            with open(dest_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=1 << 16):
                    f.write(chunk)
        return dest_path
