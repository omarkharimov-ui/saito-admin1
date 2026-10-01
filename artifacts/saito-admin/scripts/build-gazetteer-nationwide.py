#!/usr/bin/env python3
"""
11z — nationwide OSM gazetteer builder (SAITO POS).

Rebuilds src/data/streets-az.json (named streets, ALL regions of AZ) and
src/data/pois-az.json (named POIs: shops/amenities/tourism/office/craft)
from ONE-TIME Overpass extracts (public instance maps.mail.ru, 1 req/20s).

Why Overpass (and not a Geofabrik PBF): 2026-10-01 every Geofabrik mirror
was down (Squid 502/503) while maps.mail.ru Overpass recovered; a per-region
Overpass query is also easier to re-run incrementally.

Usage:
    python3 build-gazetteer-nationwide.py \
        --streets /tmp/az_streets.json \
        --pois    /tmp/az_pois.json \
        --cities  /tmp/az_cities.json \
        --out-dir src/data

Inputs are raw Overpass `out center tags` JSON (elements list). The build is
deterministic and idempotent — re-running on fresh extracts replaces the
data files. Committed to the repo so the next rebuild (new Overpass data) is
one command; see MASTER_FEATURE_MAP §10 (11z) for the exact Overpass QL.

Output schema (kept compatible with 11u so gazetteer.ts needs no shape
change):
    street: {n, c, la, lo, k}  — k = space count (11u sort key)
    poi:    {n, c, la, lo, t}  — t = POI class ("market","cafe",...)
"""
import argparse
import json
import math
import re
import sys
from collections import Counter

# Street-type tokens stripped for the DEDUP KEY only (the display name keeps
# them, like the 11u data): OSM tags the same street as both "Nizami" and
# "Nizami küçəsi" — without this they'd be two near-identical dropdown rows.
SUFFIX_TOKENS = {
    "kucesi", "kuce", "kuc", "prospekti", "prospekt", "pros",
    "bulvari", "bulvar", "bul", "sokagi", "sokag",
}


def norm_key(name: str) -> str:
    toks = translit(name).lower().split()
    while len(toks) > 1 and toks[-1].rstrip(".") in SUFFIX_TOKENS:
        toks.pop()
    return " ".join(toks)


# ASCII fold for matching keys (mirrors gazetteer.ts translitLocal).
AZ_ASCII = str.maketrans(
    "əÄäıİçÇöÖüÜşŞğĞ",   # 15 chars
    "eeeiicCoOuUsSgG",   # 15 chars, 1:1
)

CITY_TAG_KEYS = [
    "addr:city:az", "addr:city", "addr:town:az", "addr:town",
    "addr:village", "address:city", "address:town", "addr:municipality",
]

# The 3x3 fetch grid bleeds into border territory (Kars/MIYANEH/Dagestan/
# Syunik/Tqibuli). Foreign NAMES are rejected by script:
#   Armenian \u0530-\u058F · Georgian \u10A0-\u10FF · Persian \u0600-\u06FF ·
#   Cyrillic (Dagestan/Russia; AZ `name` tags are Latin) · Turkish
#   "… Caddesi/Sokak" (Latin — caught by word, not script).

# OSM noise: ways tagged name="10", "8km", "833001440956940" (phone numbers),
# "994508041182" — utility lines mis-tagged as roads. A delivery gazetteer
# must not suggest these.
import re as _re
NUM_NOISE = _re.compile(r"^[\s0-9()+#.\-]{2,}$")   # digits/punctuation only


def garbage_name(name: str) -> bool:
    if not name:
        return True
    if NUM_NOISE.match(name):
        return True
    # "8km", "12Km" — distance markers
    if _re.fullmatch(r"\d+\s?km", name, _re.IGNORECASE):
        return True
    # phone-number-like: 9+ digits with optional +994/0 prefix
    digits = _re.sub(r"\D", "", name)
    if len(digits) >= 9 and len(digits) >= len(name) * 0.7:
        return True
    return False


def foreign_name(name: str) -> bool:
    for ch in name:
        o = ord(ch)
        if 0x0530 <= o <= 0x058F or 0x10A0 <= o <= 0x10FF or 0x0600 <= o <= 0x06FF:
            return True
        if 0x0400 <= o <= 0x04FF:
            return True
    low = name.lower()
    return ("caddesi" in low) or ("caddesı" in low) or ("sokak" in low) or ("cad." in low.split())


def translit(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().translate(AZ_ASCII)


def centroid(el: dict):
    """out center → (lat, lon). `center` is NESTED for ways/relations
    ({"center": {"lat":..,"lon":..}}); top-level lat/lon only for nodes."""
    c = el.get("center")
    if c and c.get("lat") is not None:
        return float(c["lat"]), float(c["lon"])
    lat, lon = el.get("lat"), el.get("lon")
    if lat is not None and lon is not None:
        return float(lat), float(lon)
    geom = (el.get("geometry") or [])
    if geom:
        return (sum(g[0] for g in geom) / len(geom), sum(g[1] for g in geom) / len(geom))
    return None


def nearest_city(lat: float, lon: float, cities):
    """Locality label for an untagged point — CASCADE by admin level:
    al6 (city) within 40km is what the operator thinks ("Bakı", "Gəncə");
    al8 (village/town) within 25km is the real locality in rural areas;
    al4 (rayon) within 80km is the last resort. Without the cascade every
    untagged Bakı street got labelled "Xəzər rayonu" (rayon centroid)."""
    def nearest(al, cap_km):
        bd, best = 1e18, None
        for c in cities:
            if c.get("al") != al:
                continue
            d = (c["lat"] - lat) ** 2 + (c["lon"] - lon) ** 2
            if d < bd:
                bd, best = d, c
        if best and math.sqrt(bd) * 111.0 <= cap_km:
            return best["name"]
        return None

        # al is stored as STRINGS ("4"/"6"/"8") — keep the types aligned.
    return (nearest("6", 40) or nearest("8", 25) or nearest("4", 80))


# "Gəncə İnzibati Ərazisi" → "Gəncə" (addr:city hygiene). "Suraxanı rayonu"
# keeps the rayon name — it is the right locality label for that district.
# NOTE: Unicode has NO case pair between i (U+0069) and İ (U+0130) —
       # re.IGNORECASE does NOT fold them, so the class lists both explicitly.
RAYON_SUFFIX = re.compile(r"\s+([iIİ]nzibati\s+[əƏeE]razisi|[şŞ][əe]hər\s+[əƏeE]razisi)$", re.IGNORECASE)


def clean_city(name: str) -> str:
    return RAYON_SUFFIX.sub("", name).strip()


def build_streets(elements, cities):
    seen, out = set(), []
    for el in elements:
        t = el.get("tags") or {}
        name = (t.get("name") or t.get("name:az") or "").strip()
        if not name or el.get("type") != "way":
            continue
        if foreign_name(name) or garbage_name(name):
            continue
        # PBF source (w/name) also carries named rails/waterways/boundaries —
        # a delivery gazetteer wants ROADS only.
        if not t.get("highway"):
            continue
        if t.get("highway") in ("construction", "proposed", "abandoned"):
            continue
        p = centroid(el)
        if p is None:
            continue
        lat, lon = p
        if not (-20 < lat < 55 and 35 < lon < 65):  # sanity: inside/near AZ
            continue
        city = None
        for k in CITY_TAG_KEYS:
            if t.get(k):
                city = clean_city(t[k].strip())
                break
        if not city:
            city = nearest_city(lat, lon, cities)
        # Display name `n` keeps the suffix (like 11u data); the DEDUP KEY
        # strips street-type tokens so "Nizami" + "Nizami küçəsi" merge.
        key = (norm_key(name), (translit(city).lower() if city else ""))
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "n": name,
            "c": city or "",
            "la": round(lat, 6),
            "lo": round(lon, 6),
            "k": name.count(" "),
        })
    # Sort: k ascending (single-token major streets first), then name —
    # localPrefix scans in file order, so famous short names surface first.
    out.sort(key=lambda s: (s["k"], translit(s["n"]).lower()))
    return out


POI_CLASS = {
    "shop": "market", "amenity": "amenity", "tourism": "tourism",
    "office": "office", "craft": "craft", "leisure": "leisure",
    "hotel": "hotel", "restaurant": "cafe", "cafe": "cafe",
    "fuel": "fuel", "pharmacy": "pharmacy", "bank": "bank",
    "healthcare": "healthcare", "education": "education",
}


def build_pois(elements, cities):
    seen, out = set(), []
    for el in elements:
        if el.get("type") != "node":
            continue
        t = el.get("tags") or {}
        name = (t.get("name") or t.get("name:az") or "").strip()
        if not name or len(name) < 2 or garbage_name(name):
            continue
        p = centroid(el)
        if p is None:
            continue
        lat, lon = p
        if not (-20 < lat < 55 and 35 < lon < 65):
            continue
        cls = "place"
        for k, v in POI_CLASS.items():
            if t.get(k):
                cls = v
                break
        # PBF source (n/name) is broader than the Overpass grid (which was
        # pre-filtered by class): skip named nodes WITHOUT a class tag —
        # street signs, benches, named trees are not delivery targets.
        if cls == "place":
            continue
        city = None
        for key in CITY_TAG_KEYS:
            if t.get(key):
                city = clean_city(t[key].strip())
                break
        if not city:
            city = nearest_city(lat, lon, cities)
        key = (translit(name).lower(), (translit(city).lower() if city else ""))
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "n": name,
            "c": city or "",
            "la": round(lat, 6),
            "lo": round(lon, 6),
            "t": cls,
        })
    out.sort(key=lambda s: (translit(s["c"]).lower(), translit(s["n"]).lower()))
    return out


def build_cities(elements):
    """admin_level 4 (rayon) / 6 (city) / 8 (village) → nearest-city table."""
    out, seen = [], set()
    for el in elements:
        t = el.get("tags") or {}
        if t.get("boundary") != "administrative":
            continue
        al = t.get("admin_level")
        if al not in ("4", "6", "8"):
            continue
        name = (t.get("name") or "").strip()
        p = centroid(el)
        if not name or p is None:
            continue
        name = clean_city(name)  # "Gəncə İnzibati Ərazisi" → "Gəncə" (cascade label)
        k = translit(name).lower()
        if k in seen:
            continue
        seen.add(k)
        out.append({"name": name, "lat": round(p[0], 5), "lon": round(p[1], 5), "al": al})
    # smaller admin level first (city before its rayon) for nearest-pick
    out.sort(key=lambda c: (int(c["al"]), translit(c["name"]).lower()))
    return out


def _geojson_to_elements(data):
    """osmium export -f geojson → Overpass-like elements. Points → nodes
    (top-level lat/lon); Lines/MultiLines → ways with a NESTED `center`
    (mean of all ring coordinates ≈ road midpoint)."""
    els = []
    for ft in data.get("features", []):
        g = ft.get("geometry") or {}
        coords = g.get("coordinates")
        if not coords:
            continue
        tags = ft.get("properties") or {}
        if g.get("type") == "Point":
            els.append({"type": "node", "lon": coords[0], "lat": coords[1],
                        "tags": tags, "id": None})
            continue
        pts = []

        def flat(c):
            if len(c) >= 2 and isinstance(c[0], (int, float)):
                pts.append((c[0], c[1]))
            else:
                for x in c:
                    flat(x)

        flat(coords)
        if not pts:
            continue
        els.append({"type": "way", "tags": tags, "id": None,
                    "center": {"lon": sum(p[0] for p in pts) / len(pts),
                               "lat": sum(p[1] for p in pts) / len(pts)}})
    return els


def load_elements(path):
    """A single Overpass JSON, OR a directory of them (the 3x3 grid), OR an
    osmium GeoJSON export. Elements merged + deduped by (type, id) — GeoJSON
    features carry no OSM id, so (type, name, point) keys them."""
    import glob
    import os
    files = [path]
    if os.path.isdir(path):
        files = sorted(glob.glob(os.path.join(path, "*.json")))
    seen, out = set(), []
    for fp in files:
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "features" in data:
            elements = _geojson_to_elements(data)
        else:
            elements = data.get("elements", [])
        for el in elements:
            if el.get("id") is not None:
                key = (el.get("type"), el.get("id"))
            else:
                c = el.get("center") or {}
                key = (el.get("type"), (el.get("tags") or {}).get("name"),
                       el.get("lat", c.get("lat")), el.get("lon", c.get("lon")))
            if key in seen:
                continue
            seen.add(key)
            out.append(el)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--streets", required=True, help="concatenated Overpass elements JSON")
    ap.add_argument("--pois", required=True, help="concatenated Overpass elements JSON")
    ap.add_argument("--cities", required=True,
                    help="JSON: either a plain list of {name,lat,lon} (Nominatim) "
                         "or an Overpass elements doc (admin relations)")
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()

    with open(a.cities, "r", encoding="utf-8") as f:
        cdata = json.load(f)
    if isinstance(cdata, list):
        cities = [{"name": c["name"], "lat": float(c["lat"]), "lon": float(c["lon"]), "al": "6"} for c in cdata]
    else:
        cities = build_cities(load_elements(a.cities))
    print(f"cities: {len(cities)}")

    streets = build_streets(load_elements(a.streets), cities)
    print(f"streets: {len(streets)} unique (name+suffix-stripped key, city)")
    by_city = Counter(s["c"] or "?" for s in streets)
    print("top cities:", by_city.most_common(8))

    pois = build_pois(load_elements(a.pois), cities)
    print(f"pois: {len(pois)} unique (name, city)")
    print("top poi classes:", Counter(p["t"] for p in pois).most_common(8))

    import os
    os.makedirs(a.out_dir, exist_ok=True)
    sp = os.path.join(a.out_dir, "streets-az.json")
    pp = os.path.join(a.out_dir, "pois-az.json")
    with open(sp, "w", encoding="utf-8") as f:
        json.dump(streets, f, ensure_ascii=False, separators=(",", ":"))
    with open(pp, "w", encoding="utf-8") as f:
        json.dump(pois, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {sp} ({os.path.getsize(sp) // 1024} KB)")
    print(f"wrote {pp} ({os.path.getsize(pp) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
