#!/usr/bin/env python3
"""Scrape CQL code examples from the CrowdStrike LogScale documentation.

Crawls https://library.humio.com/crowdstrike-query-language/ (plus the
grammar guide under /lql-grammar/), extracts every code block and writes one
JSON object per block to examples.jsonl. Raw HTML is cached in .cache/ so
re-runs are cheap; pass --refresh to re-download.

Standard library only. Usage:
    python3 -I scripts/scrape-docs.py [--out DIR] [--refresh] [--delay SECONDS]

The output directory defaults to $CQL_CORPUS, else ~/Local_Projects/cql-corpus.
Keep it out of public repositories: it is CrowdStrike documentation content.
"""

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, deque
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

ROOT = "https://library.humio.com/"
SECTIONS = ("crowdstrike-query-language/", "lql-grammar/")
SEEDS = [
    ROOT + "crowdstrike-query-language/index.html",
    ROOT + "crowdstrike-query-language/syntax.html",
    ROOT + "crowdstrike-query-language/functions.html",
    ROOT + "lql-grammar/syntax-grammar-guide.html",
]
UA = "cql-corpus-scraper/1.0 (personal test corpus; +https://github.com/brandonvader)"


class Page(HTMLParser):
    """Collects links, headings and code blocks (with their context)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = set()
        self.blocks = []
        self.title = ""
        self._stack = []          # (tag, attrs) of open elements
        self._heading = None      # text buffer while inside h1-h6
        self._heading_id = None
        self.cur_heading = ""
        self.cur_anchor = ""
        self._lang = None         # text buffer while inside span.code-lang
        self._last_lang = ""
        self._code = None         # text buffer while inside <pre>
        self._in_title = False

    @staticmethod
    def _cls(attrs):
        return set((dict(attrs).get("class") or "").split())

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag not in ("br", "img", "meta", "link", "input", "hr", "path"):
            self._stack.append((tag, a))
        if tag == "a" and a.get("href"):
            self.links.add(a["href"])
        if tag == "title":
            self._in_title = True
        if re.fullmatch(r"h[1-6]", tag):
            self._heading = []
            self._heading_id = a.get("id")
        if a.get("id") and self._heading is None and self._code is None:
            self.cur_anchor = a["id"]
        if tag == "span" and "code-lang" in self._cls(attrs):
            self._lang = []
        if tag == "button" and self._lang is not None:
            # "Reformat" / "Copy" buttons live inside the code-lang span.
            self._last_lang = "".join(self._lang).strip()
            self._lang = None
        if tag == "pre":
            self._code = []

    def handle_endtag(self, tag):
        # Pop to the matching open element (tolerates sloppy nesting).
        for i in range(len(self._stack) - 1, -1, -1):
            if self._stack[i][0] == tag:
                del self._stack[i:]
                break
        if tag == "title":
            self._in_title = False
        if re.fullmatch(r"h[1-6]", tag) and self._heading is not None:
            self.cur_heading = re.sub(r"\s+", " ", "".join(self._heading)).strip()
            if self._heading_id:
                self.cur_anchor = self._heading_id
            self._heading = None
        if tag == "span" and self._lang is not None:
            self._last_lang = "".join(self._lang).strip()
            self._lang = None
        if tag == "pre" and self._code is not None:
            step = next((a.get("id") for t, a in reversed(self._stack)
                         if t == "li" and re.search(r"-step-\d+$", a.get("id") or "")), None)
            proglist = next((self._cls(list(a.items())) for t, a in reversed(self._stack)
                             if "proglist" in (a.get("class") or "")), set())
            self.blocks.append({
                "code": "".join(self._code),
                "lang": self._last_lang,
                "heading": self.cur_heading,
                "anchor": step or self.cur_anchor,
                "step": bool(step),
                "proglist": sorted(proglist - {"proglist"}),
            })
            self._code = None
            self._last_lang = ""

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._heading is not None:
            self._heading.append(data)
        if self._lang is not None:
            self._lang.append(data)
        if self._code is not None:
            self._code.append(data)


def fetch(url, cache, refresh, delay):
    key = cache / (hashlib.sha1(url.encode()).hexdigest() + ".html")
    if key.exists() and not refresh:
        return key.read_text(encoding="utf-8")
    time.sleep(delay)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8", "replace")
    key.write_text(body, encoding="utf-8")
    return body


def in_scope(url):
    p = urllib.parse.urlparse(url)
    return (p.scheme == "https" and p.netloc == "library.humio.com"
            and p.path.endswith(".html")
            and any(p.path.startswith("/" + s) for s in SECTIONS))


def classify(b):
    """kind: query | step | syntax | other (non-CQL language label)."""
    lang = b["lang"].lower()
    if not lang.startswith("logscale"):
        return "other"
    if "syntax" in lang or "syntax" in b["proglist"]:
        return "syntax"
    if b["step"]:
        return "step"
    return "query"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=Path(os.environ.get("CQL_CORPUS", Path.home() / "Local_Projects" / "cql-corpus")))
    ap.add_argument("--refresh", action="store_true", help="ignore the HTML cache")
    ap.add_argument("--delay", type=float, default=0.25, help="seconds between requests")
    ap.add_argument("--max-pages", type=int, default=5000)
    args = ap.parse_args()

    cache = args.out / ".cache"
    cache.mkdir(parents=True, exist_ok=True)

    seen, queue, pages = set(), deque(SEEDS), 0
    examples, errors = [], []
    while queue and pages < args.max_pages:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        try:
            body = fetch(url, cache, args.refresh, args.delay)
        except (urllib.error.URLError, TimeoutError) as e:
            errors.append(f"{url}: {e}")
            continue
        pages += 1
        p = Page()
        p.feed(body)
        for href in p.links:
            nxt = urllib.parse.urljoin(url, href).split("#")[0].split("?")[0]
            if in_scope(nxt) and nxt not in seen:
                queue.append(nxt)
        title = re.sub(r"\s+", " ", html.unescape(p.title)).strip()
        for i, b in enumerate(p.blocks):
            code = b["code"].replace("\r\n", "\n").strip("\n")
            if not code.strip():
                continue
            examples.append({
                "id": hashlib.sha1(f"{url}#{i}\0{code}".encode()).hexdigest()[:12],
                "url": url + (f"#{b['anchor']}" if b["anchor"] else ""),
                "page": urllib.parse.urlparse(url).path,
                "page_title": title,
                "heading": b["heading"],
                "index": i,
                "lang": b["lang"],
                "kind": classify(b),
                "code": code,
            })
        if pages % 50 == 0:
            print(f"  {pages} pages, {len(examples)} blocks, queue {len(queue)}", file=sys.stderr)

    examples.sort(key=lambda e: (e["page"], e["index"]))
    with open(args.out / "examples.jsonl", "w", encoding="utf-8") as f:
        for e in examples:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    kinds = Counter(e["kind"] for e in examples)
    langs = Counter(e["lang"] for e in examples)
    unique_queries = len({e["code"] for e in examples if e["kind"] == "query"})
    meta = {
        "scraped": date.today().isoformat(),
        "pages": pages,
        "blocks": len(examples),
        "kinds": dict(kinds),
        "unique_query_blocks": unique_queries,
        "langs": dict(langs.most_common()),
        "errors": errors,
    }
    (args.out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
