import json
import re
import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

session = requests.Session()
session.headers.update({
    "User-Agent": "france-power-plants-enricher/1.0 (test)"
})

def fetch(osm_type, osm_id):
    query = f"""
        [out:json][timeout:30];
        {osm_type}({osm_id});
        >>;
        out geom;
        """
    r = session.post(OVERPASS_URL, data={"data": query}, timeout=60)
    r.raise_for_status()
    data = r.json()
    return data

def enrich_from_openstreetmap(osm_url):
    match = re.search(r"openstreetmap\.org/(relation|way|node)/(\d+)", osm_url)
    if not match:
        return {"tags": {}, "nodes": []}
    return fetch(match.group(1), match.group(2))

with open("test.json", "w") as f:
    json.dump(enrich_from_openstreetmap("https://www.openstreetmap.org/relation/20240158"), f, ensure_ascii=False, indent=2)