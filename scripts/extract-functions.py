#!/usr/bin/env python3
"""Build src/catalog/functions.json from the CQL function reference pages.

Reads the HTML cached by scripts/scrape-docs.py (in $CQL_CORPUS/.cache, default
~/Local_Projects/cql-corpus/.cache; run the scraper first). Keeps facts only:
function names, signatures, function types, parameter names, types,
required/optional, defaults, allowed values, and the documentation URL.
Description text is deliberately not copied: hovers link to the docs instead.

    python3 scripts/extract-functions.py [--cache DIR] [--out FILE]
"""

import argparse
import hashlib
import html
import json
import os
import re
import sys
from pathlib import Path

BASE = "https://library.humio.com/crowdstrike-query-language/"

# Parameters the docs use elsewhere but leave out of a function's own table.
ADDITIONS = {
    # ad-hoc tables from defineTable(): match(table="name", field=..., column=...)
    "match": [{"name": "table", "type": "string", "required": False}],
}


def text(fragment):
    s = re.sub(r"<sup[^>]*>.*?</sup>", "", fragment, flags=re.S)  # footnote marks
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def cells(row):
    return re.findall(r"<td([^>]*)>(.*?)</td>", row, flags=re.S)


def page(cache, name):
    f = cache / (hashlib.sha1((BASE + name).encode()).hexdigest() + ".html")
    return f.read_text(encoding="utf-8") if f.exists() else None


def parse_function(slug, src):
    sig = re.search(r"<strong>Signature</strong></span></td><td>(.*?)</td>", src, re.S)
    if not sig:
        return None  # a category page, not a function
    signature = text(sig.group(1))
    name = signature.split("(", 1)[0].strip()
    ftype = re.search(r"<strong>Function Type</strong></span></td><td>(.*?)</td>", src, re.S)
    dep = re.search(r'<div class="depnote"><h3>(.*?)</h3>', src, re.S)

    fn = {"name": name, "signature": signature, "url": f"functions-{slug}.html"}
    if ftype:
        fn["kind"] = [k.strip() for k in text(ftype.group(1)).split(",") if k.strip()]
    if dep:
        fn["deprecated"] = re.sub(r"^Deprecated:\s*", "", text(dep.group(1))) or "Deprecated"

    table = re.search(
        rf'id="table_table-functions-{re.escape(slug)}".*?<tbody>(.*?)</tbody>(.*?)</table>', src, re.S
    )
    params = []
    if table:
        footnotes = text(table.group(2))
        unnamed = set(re.findall(r"The parameter name (\S+) can be omitted", footnotes))
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table.group(1), re.S):
            tds = cells(row)
            head_id = re.search(rf'id="query-functions-{re.escape(slug)}-([^"]+)"', tds[0][0]) if tds else None
            if head_id and len(tds) >= 5 and "-option-" not in head_id.group(1):
                pname = re.search(r"<code>(.*?)</code>", tds[0][1])
                if not pname:
                    continue
                p = {"name": text(pname.group(1)), "type": text(tds[1][1])}
                p["required"] = text(tds[3][1]).lower().startswith("required")
                default = text(tds[4][1])
                if default:
                    p["default"] = default
                if p["name"] in unnamed:
                    p["unnamed"] = True
                if "(deprecated)" in text(tds[0][1]):
                    p["deprecated"] = True
                params.append(p)
                continue
            # Allowed value rows: "<td><code class="option">asc</code></td><td id="...-option-asc">"
            if params and any("-option-" in attrs for attrs, _ in tds):
                for i, (attrs, body) in enumerate(tds):
                    if "-option-" in attrs and i > 0:
                        value = text(tds[i - 1][1])
                        if value:
                            params[-1].setdefault("values", []).append(value)
    for extra in ADDITIONS.get(name, []):
        if not any(p["name"] == extra["name"] for p in params):
            params.append(dict(extra))
    fn["params"] = params
    return fn


def main():
    corpus = Path(os.environ.get("CQL_CORPUS", Path.home() / "Local_Projects" / "cql-corpus"))
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cache", type=Path, default=corpus / ".cache")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "src/catalog/functions.json")
    args = ap.parse_args()

    index = page(args.cache, "functions.html")
    if index is None:
        sys.exit(f"functions.html not found in {args.cache}; run scripts/scrape-docs.py first")
    slugs = sorted(set(re.findall(r'href="functions-([a-z0-9-]+)\.html"', index)))

    functions, missing = [], []
    for slug in slugs:
        src = page(args.cache, f"functions-{slug}.html")
        if src is None:
            missing.append(slug)
            continue
        fn = parse_function(slug, src)
        if fn:
            functions.append(fn)
    functions.sort(key=lambda f: f["name"].lower())

    meta = args.cache.parent / "meta.json"
    scraped = json.loads(meta.read_text())["scraped"] if meta.exists() else None
    out = {
        "source": BASE + "functions.html",
        "scraped": scraped,
        "note": "Facts extracted from the CrowdStrike Query Language function reference; see the linked pages for documentation.",
        "functions": functions,
    }
    args.out.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(functions)} functions -> {args.out}")
    if missing:
        print(f"not cached (skipped): {', '.join(missing)}")


if __name__ == "__main__":
    main()
