import json
from collections import Counter

with open("france_power_plants_enriched.json", "r", encoding="utf-8") as f:
    plants = json.load(f)

total = len(plants)
errors = {
    "error_top_level": [],
    "detail_page_error": [],
    "wikidata_error": [],
    "osm_fetch_error": [],
}

for p in plants:
    name = p.get("name", "?")
    if "error" in p:
        errors["error_top_level"].append((name, p["error"]))
    if "detail_page_error" in p:
        errors["detail_page_error"].append((name, p["detail_page_error"]))
    if "wikidata_error" in p:
        errors["wikidata_error"].append((name, p["wikidata_error"]))
    # OSM peut être niché dans detail_page_data
    dpd = p.get("detail_page_data", {}) or {}
    osm = dpd.get("osm_details")
    if isinstance(osm, dict) and "error" in osm:
        errors["osm_fetch_error"].append((name, osm["error"]))

for category, items in errors.items():
    print(f"\n── {category} : {len(items)} ──")
    types = Counter(e.split(":")[0].strip() for _, e in items)
    for t, n in types.most_common():
        print(f"  {n:3d}x  {t}")
    for name, msg in items[:5]:
        print(f"        • {name}: {msg[:120]}")