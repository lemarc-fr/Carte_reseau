import json
import re
import time
from urllib.parse import urljoin
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

INPUT_JSON = "france_power_plants.json"
OUTPUT_JSON = "france_power_plants_enriched.json"

OSM_USER_AGENT = "france-power-plants-enricher/1.0 (contact@example.com)"

MAX_WORKERS = 10
REQUEST_DELAY = 0.1
SAVE_EVERY = 100

def make_session():
    s = requests.Session()
    s.headers.update({"User-Agent": OSM_USER_AGENT})
    retry = Retry(
        total=3,
        backoff_factor=2,
        status_forcelist=[429, 503],
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s

session = make_session()

retry_plants = []

def enrich_from_detail_page(detail_url):
    response = session.get(detail_url, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    enriched = {
        "openstreetmap_url": None,
        "entsoe_eic": None,
        "osm_details": None
    }
    osm_link = soup.find("a", string="OpenStreetMap")
    if osm_link and osm_link.get("href"):
        enriched["openstreetmap_url"] = osm_link["href"]
    rows = soup.find_all("tr")
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        key = cells[0].get_text(strip=True)
        if "ENTSOE_EIC" in key:
            value = cells[1].get_text(strip=True)
            if value:
                enriched["entsoe_eic"] = value.split(";")
            break
    if enriched["openstreetmap_url"]:
        enriched["osm_details"] = enrich_from_openstreetmap(enriched["openstreetmap_url"])
    return enriched

def fetch_node_coordinates_from_page(node_url):
    """Récupère lat/lon depuis une page /node/XXXX"""
    response = session.get(node_url, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    lat_span = soup.find("span", class_="latitude")
    lon_span = soup.find("span", class_="longitude")
    if not lat_span or not lon_span:
        return None
    try:
        return {
            "url": node_url,
            "latitude": float(lat_span.get_text(strip=True)),
            "longitude": float(lon_span.get_text(strip=True))
        }
    except Exception:
        return None

def fetch_osm_element(osm_type, osm_id):
    query = f"""
    [out:json][timeout:30];
    {osm_type}({osm_id});
    >>;
    out geom;
    """
    response = session.post(OVERPASS_URL, data={"data": query}, timeout=60)
    response.raise_for_status()
    data = response.json()
    elements = data["elements"]

    result = {"tags": {}, "nodes": [], "ways": [], "relations": []}

    root = next(
        (el for el in elements if el["type"] == osm_type and str(el["id"]) == str(osm_id)),
        None
    )
    if root:
        result["tags"] = root.get("tags", {})

    # Nodes : id, lat, lon, tags
    result["nodes"] = [
        {
            "id": el["id"],
            "latitude": el["lat"],
            "longitude": el["lon"],
            "tags": el.get("tags", {}),
        }
        for el in elements
        if el["type"] == "node" and "lat" in el
    ]

    # Ways : id, tags, et la géométrie inline (liste de {lat, lon})
    # `out geom` injecte directement `geometry` dans chaque way — pas besoin de croiser les nodes
    result["ways"] = [
        {
            "id": el["id"],
            "tags": el.get("tags", {}),
            "refs": el.get("nodes", []),          # ids des nodes membres
            "geometry": el.get("geometry", []),   # [{lat, lon}, ...] injecté par out geom
        }
        for el in elements
        if el["type"] == "way"
    ]

    # Relations : id, tags, membres (type/ref/role)
    result["relations"] = [
        {
            "id": el["id"],
            "tags": el.get("tags", {}),
            "members": [
                {
                    "type": m["type"],
                    "ref": m["ref"],
                    "role": m.get("role", ""),
                    # out geom injecte aussi geometry dans les membres way des relations
                    "geometry": m.get("geometry", []),
                }
                for m in el.get("members", [])
            ],
        }
        for el in elements
        if el["type"] == "relation"
    ]

    return result

def enrich_from_openstreetmap(osm_url):
    match = re.search(r"openstreetmap\.org/(relation|way|node)/(\d+)", osm_url)
    if not match:
        return {"tags": {}, "node_coordinates": []}
    osm_type, osm_id = match.group(1), match.group(2)
    return fetch_osm_element(osm_type, osm_id)

def get_claim(entity, prop):
    return entity.get("claims", {}).get(prop, [])

def get_string_claims(entity, prop):
    values = []
    for claim in get_claim(entity, prop):
        try:
            values.append(claim["mainsnak"]["datavalue"]["value"])
        except Exception:
            pass
    return values

def get_quantity_claim(entity, prop):
    try:
        claim = get_claim(entity, prop)[0]
        amount = claim["mainsnak"]["datavalue"]["value"]["amount"]
        return float(amount.replace("+", ""))
    except Exception:
        return None

def get_coordinate_claim(entity):
    try:
        claim = get_claim(entity, "P625")[0]
        value = claim["mainsnak"]["datavalue"]["value"]
        return {
            "latitude": value["latitude"],
            "longitude": value["longitude"]
        }
    except Exception:
        return None

def get_time_claim(entity, prop):
    try:
        claim = get_claim(entity, prop)[0]
        raw = claim["mainsnak"]["datavalue"]["value"]["time"]
        return raw.replace("+", "").replace("T00:00:00Z", "")
    except Exception:
        return None

def enrich_from_wikidata(wikidata_id):
    url = f"https://www.wikidata.org/wiki/Special:EntityData/{wikidata_id}.json"
    response = session.get(url, timeout=30)
    response.raise_for_status()
    data = response.json()
    entity = data["entities"][wikidata_id]
    enriched = {}
    coords = get_coordinate_claim(entity)
    if coords:
        enriched["latitude"] = coords["latitude"]
        enriched["longitude"] = coords["longitude"]
    commissioning_date = get_time_claim(entity, "P729")
    if not commissioning_date:
        commissioning_date = get_time_claim(entity, "P571")
    enriched["commissioning_date"] = commissioning_date
    enriched["power_mw"] = get_quantity_claim(entity, "P2109")
    enriched["eics"] = get_string_claims(entity, "P8645")
    return enriched

def process_plant(index, total, plant):
    print(f"[{index}/{total}] {plant.get('name')}")
    detail_url = plant.get("detail_url")
    wikidata_id = plant.get("wikidata_id")

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {}

        if detail_url:
            futures["detail"] = pool.submit(enrich_from_detail_page, detail_url)
        if wikidata_id:
            futures["wikidata"] = pool.submit(enrich_from_wikidata, wikidata_id)

        if "detail" in futures:
            try:
                plant["detail_page_data"] = futures["detail"].result()
            except Exception as e:
                plant["detail_page_error"] = str(e)

        if "wikidata" in futures:
            try:
                plant["wikidata_details"] = futures["wikidata"].result()
            except requests.HTTPError as e:
                if e.response.status_code == 429:
                    print(f"429 sur {wikidata_id}")
                    retry_plants.append((index, plant))
                else:
                    plant["wikidata_error"] = str(e)
            except Exception as e:
                plant["wikidata_error"] = str(e)

    time.sleep(REQUEST_DELAY)
    return plant

def main():
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        plants = json.load(f)
    total = len(plants)
    results = [None] * total

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_plant, i + 1, total, plant): i
            for i, plant in enumerate(plants)
        }
        completed = 0
        for future in as_completed(futures):
            index = futures[future]
            try:
                results[index] = future.result()
            except Exception as e:
                print("Erreur future:", e)

            completed += 1

            if completed % 10 == 0:
                print(f"  [debug] completed={completed}, dernier index={index}")
                print(f"  [debug] résultat: {results[index]}")

            if completed % SAVE_EVERY == 0:
                snapshot = [r for r in results if r is not None]
                tmp_path = OUTPUT_JSON + ".tmp"
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(snapshot, f, ensure_ascii=False, indent=2)
                print(f"[autosave] {completed}/{total} — {len(snapshot)} résultats → {tmp_path}")

    if retry_plants:
        print(f"\n=== RETRY 429 ({len(retry_plants)}) ===\n")
        time.sleep(10)
        for index, plant in retry_plants:
            wikidata_id = plant.get("wikidata_id")
            print(f"[RETRY] {wikidata_id}")
            try:
                enrichment = enrich_from_wikidata(wikidata_id)
                plant["wikidata_details"] = enrichment
                if "wikidata_error" in plant:
                    del plant["wikidata_error"]
            except Exception as e:
                plant["wikidata_error"] = str(e)
            time.sleep(1.5)
            results[index - 1] = plant

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\nFichier sauvegardé: {OUTPUT_JSON}")

if __name__ == "__main__":
    main()