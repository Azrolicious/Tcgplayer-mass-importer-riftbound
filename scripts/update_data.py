#!/usr/bin/env python3
"""Refresh data/riftbound-cards.js from TCGCSV (a daily mirror of TCGplayer's catalog).

Uses only the Python standard library, so it runs anywhere Python 3.8+ is installed:

    python3 scripts/update_data.py

The output is a plain JavaScript file (not JSON) so index.html can load it with a
<script> tag. That keeps the app working when index.html is opened straight from
disk (file://), where browsers block fetch() of local files.
"""

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CATEGORY_ID = 89  # "Riftbound League of Legends Trading Card Game" on TCGplayer
BASE = "https://tcgcsv.com/tcgplayer"
OUT = Path(__file__).resolve().parent.parent / "data" / "riftbound-cards.js"
HEADERS = {"User-Agent": "riftbound-mass-entry-helper/1.0 (+https://tcgcsv.com)"}


def get_json(url, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except Exception as exc:  # network hiccup: back off and retry
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  retrying {url} in {wait}s ({exc})", file=sys.stderr)
            time.sleep(wait)


def ext(product, key):
    for item in product.get("extendedData") or []:
        if item.get("name") == key:
            return item.get("value")
    return None


def is_single(product):
    # Sealed products (boxes, packs, decks, bundles) carry no rarity or collector number.
    return bool(ext(product, "Rarity") or ext(product, "Number"))


TAG = re.compile(r"\(([^()]*)\)")
ALT_RUNE = re.compile(r"^(?:[A-Z]|R\d+[a-z])$")  # "Fury Rune (A)", "Calm Rune (R02b)"
STANDARD_TAGS = {"Starter"}  # Proving Grounds starter-deck printings are ordinary cards


def variant_of(name):
    """Sort a card into a version bucket using the tags TCGplayer puts in product names.

    "standard"     no special tag
    "alt-art"      (Alternate Art), alternate-art runes, (... Special Art ...), (Full Art)
    "signature"    (Signature), (Heartsteel Signature)
    "overnumbered" (Overnumbered), (Heartsteel Overnumbered)
    "metal"        (Metal) prize cards
    "other"        anything else special: Oversized, Top 8, Champion, serial-numbered, ...
    """
    tags = [t.strip() for t in TAG.findall(name)]
    tags = [t for t in tags if t and not t.isdigit() and t not in STANDARD_TAGS]  # "(271)" is a number
    if not tags:
        return "standard"
    if any(t == "Alternate Art" or ALT_RUNE.match(t) or "Special Art" in t or t == "Full Art" for t in tags):
        return "alt-art"
    if any(t.endswith("Signature") for t in tags):
        return "signature"
    if any(t.endswith("Overnumbered") for t in tags):
        return "overnumbered"
    if "Metal" in tags:
        return "metal"
    return "other"


NUMBER = re.compile(r"^(\d+)/(\d+)$")  # "027/298"; not "027a/298", "299*/298", "R01", "T1A 001/005"


def main_run(singles):
    """Return the size D of the group's own numbered run (cards 1..D), or None.

    A group owns "/D" only when those cards are most of the group and nearly every number
    from 1 to D is present. Promo groups reuse other sets' numbers (an Organized Play promo
    can be "246/298"), so they don't own a run and all their cards count as extras.
    """
    by_den = {}
    for p in singles:
        m = NUMBER.match(ext(p, "Number") or "")
        if m:
            by_den.setdefault(int(m.group(2)), []).append(int(m.group(1)))
    if not by_den:
        return None
    den, nums = max(by_den.items(), key=lambda kv: len(kv[1]))
    in_run = {n for n in nums if 1 <= n <= den}
    if den > 0 and len(nums) >= 0.5 * len(singles) and len(in_run) >= 0.9 * den:
        return den
    return None


def in_main_run(product, den):
    m = NUMBER.match(ext(product, "Number") or "")
    return bool(den and m and int(m.group(2)) == den and 1 <= int(m.group(1)) <= den)


def min_price(rows, field):
    values = [r[field] for r in rows if r.get(field)]
    return round(min(values), 2) if values else None


def main():
    categories = get_json(f"{BASE}/categories")["results"]
    category = next(c for c in categories if c["categoryId"] == CATEGORY_ID)

    groups = get_json(f"{BASE}/{CATEGORY_ID}/groups")["results"]
    groups.sort(key=lambda g: (g.get("publishedOn") or "", g["name"]))

    sets, cards = [], []
    for group in groups:
        gid = group["groupId"]
        print(f"Fetching {group['name']} ({group.get('abbreviation')})...")
        products = get_json(f"{BASE}/{CATEGORY_ID}/{gid}/products")["results"]
        prices = get_json(f"{BASE}/{CATEGORY_ID}/{gid}/prices")["results"]

        price_rows = {}
        for row in prices:
            price_rows.setdefault(row["productId"], []).append(row)

        singles = [p for p in products if is_single(p)]
        if not singles:
            continue  # sealed-only group (e.g. a bundle with no singles listed)

        run = main_run(singles)
        sets.append({
            "id": gid,
            "name": group["name"],
            "code": group.get("abbreviation") or "",
            "released": (group.get("publishedOn") or "")[:10],
            "mainSize": run,  # e.g. 298 for Origins; null for promo/bundle groups
        })
        for p in singles:
            rows = price_rows.get(p["productId"], [])
            cards.append({
                "id": p["productId"],
                "set": gid,
                "name": p["name"],
                "number": ext(p, "Number") or "",
                "rarity": ext(p, "Rarity") or "None",
                "variant": variant_of(p["name"]),
                "main": in_main_run(p, run),  # one of the set's numbered cards (e.g. 001-298)
                "type": ext(p, "Card Type") or "",
                "printings": sorted({r["subTypeName"] for r in rows}),
                "market": min_price(rows, "marketPrice"),
                "low": min_price(rows, "lowPrice"),
            })

    data = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "https://tcgcsv.com",
        "productLine": {
            "id": CATEGORY_ID,
            "name": category["name"],
            "displayName": category.get("displayName") or category["name"],
        },
        "sets": sets,
        "cards": cards,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # One card per line keeps git diffs readable when prices change.
    body = body.replace(',{"id":', ',\n{"id":')
    OUT.write_text(
        "// Generated by scripts/update_data.py from TCGCSV. Do not edit by hand.\n"
        f"window.RIFTBOUND_DATA = {body};\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(cards)} cards across {len(sets)} sets to {OUT}")


if __name__ == "__main__":
    main()
