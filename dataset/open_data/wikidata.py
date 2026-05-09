import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Semaphore
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
INPUT_JSON = "france_power_plants.json"
OUTPUT_JSON = "france_power_plants_enriched.json"
OSM_USER_AGENT = "france-power-plants-enricher/1.0 (contact@example.com)"

# Limites par API pour éviter les 429
OVERPASS_SEMAPHORE = Semaphore(3)   # Overpass est le plus fragile
WIKIDATA_SEMAPHORE = Semaphore(8)
DETAIL_SEMAPHORE   = Semaphore(10)

SAVE_EVERY = 50  # Plus fréquent

def make_session():
    s = requests.Session()
    s.headers.update({"User-Agent": OSM_USER_AGENT})
    retry = Retry(
        total=4,
        backoff_factor=2,
        status_forcelist=[429, 500, 503],
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=50)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s

SESSION = make_session()


# ── Scraping detail page ──────────────────────────────────────────────────────

def enrich_from_detail_page(detail_url):
    with DETAIL_SEMAPHORE:
        r = SESSION.get(detail_url, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    enriched = {"openstreetmap_url": None, "entsoe_eic": None, "osm_details": None}

    osm_link = soup.find("a", string="OpenStreetMap")
    if osm_link and osm_link.get("href"):
        enriched["openstreetmap_url"] = osm_link["href"]

    for row in soup.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) >= 2 and "ENTSOE_EIC" in cells[0].get_text(strip=True):
            value = cells[1].get_text(strip=True)
            if value:
                enriched["entsoe_eic"] = value.split(";")
            break

    if enriched["openstreetmap_url"]:
        enriched["osm_details"] = enrich_from_openstreetmap(enriched["openstreetmap_url"])

    return enriched


# ── Overpass ──────────────────────────────────────────────────────────────────

def fetch_osm_element(osm_type, osm_id):
    query = f"""
    [out:json][timeout:30];
    {osm_type}({osm_id});
    >>;
    out geom;
    """
    with OVERPASS_SEMAPHORE:
        r = SESSION.post(OVERPASS_URL, data={"data": query}, timeout=60)
    r.raise_for_status()
    data = r.json()
    elements = data["elements"]

    result = {"tags": {}, "nodes": [], "ways": [], "relations": []}

    root = next(
        (el for el in elements if el["type"] == osm_type and str(el["id"]) == str(osm_id)),
        None,
    )
    if root:
        result["tags"] = root.get("tags", {})

    result["nodes"] = [
        {"id": el["id"], "latitude": el["lat"], "longitude": el["lon"], "tags": el.get("tags", {})}
        for el in elements if el["type"] == "node" and "lat" in el
    ]
    result["ways"] = [
        {"id": el["id"], "tags": el.get("tags", {}), "refs": el.get("nodes", []), "geometry": el.get("geometry", [])}
        for el in elements if el["type"] == "way"
    ]
    result["relations"] = [
        {
            "id": el["id"], "tags": el.get("tags", {}),
            "members": [
                {"type": m["type"], "ref": m["ref"], "role": m.get("role", ""), "geometry": m.get("geometry", [])}
                for m in el.get("members", [])
            ],
        }
        for el in elements if el["type"] == "relation"
    ]
    return result


def enrich_from_openstreetmap(osm_url):
    match = re.search(r"openstreetmap\.org/(relation|way|node)/(\d+)", osm_url)
    if not match:
        return {"tags": {}, "nodes": []}
    return fetch_osm_element(match.group(1), match.group(2))


# ── Wikidata ──────────────────────────────────────────────────────────────────

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
        amount = get_claim(entity, prop)[0]["mainsnak"]["datavalue"]["value"]["amount"]
        return float(amount.replace("+", ""))
    except Exception:
        return None

def get_coordinate_claim(entity):
    try:
        value = get_claim(entity, "P625")[0]["mainsnak"]["datavalue"]["value"]
        return {"latitude": value["latitude"], "longitude": value["longitude"]}
    except Exception:
        return None

def get_time_claim(entity, prop):
    try:
        raw = get_claim(entity, prop)[0]["mainsnak"]["datavalue"]["value"]["time"]
        return raw.replace("+", "").replace("T00:00:00Z", "")
    except Exception:
        return None

def enrich_from_wikidata(wikidata_id):
    url = f"https://www.wikidata.org/wiki/Special:EntityData/{wikidata_id}.json"
    with WIKIDATA_SEMAPHORE:
        r = SESSION.get(url, timeout=30)
    r.raise_for_status()
    entity = r.json()["entities"][wikidata_id]

    enriched = {}
    coords = get_coordinate_claim(entity)
    if coords:
        enriched.update(coords)
    enriched["commissioning_date"] = get_time_claim(entity, "P729") or get_time_claim(entity, "P571")
    enriched["power_mw"]           = get_quantity_claim(entity, "P2109")
    enriched["eics"]               = get_string_claims(entity, "P8645")
    return enriched


# ── Traitement d'une centrale (toutes les requêtes en parallèle) ──────────────

def process_plant(index, total, plant):
    name = plant.get("name", "?")
    detail_url  = plant.get("detail_url")
    wikidata_id = plant.get("wikidata_id")

    # Lance detail + wikidata en parallèle dans un pool dédié
    with ThreadPoolExecutor(max_workers=2) as pool:
        f_detail   = pool.submit(enrich_from_detail_page, detail_url)  if detail_url  else None
        f_wikidata = pool.submit(enrich_from_wikidata, wikidata_id)     if wikidata_id else None

        if f_detail:
            try:
                plant["detail_page_data"] = f_detail.result()
            except Exception as e:
                plant["detail_page_error"] = str(e)

        if f_wikidata:
            try:
                plant["wikidata_details"] = f_wikidata.result()
            except requests.HTTPError as e:
                if e.response is not None and e.response.status_code == 429:
                    raise  # remonté au niveau main pour retry
                plant["wikidata_error"] = str(e)
            except Exception as e:
                plant["wikidata_error"] = str(e)

    print(f"[{index}/{total}] {name}")

    return plant


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        plants = json.load(f)

    total   = len(plants)
    results = [None] * total
    to_retry = []  # (original_index, plant)

    # Nombre de workers élevé : le vrai throttling est fait par les sémaphores
    MAX_WORKERS = 40

    def run_batch(items):
        """items : liste de (original_index, plant)"""
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {
                executor.submit(process_plant, idx + 1, total, plant): (idx, plant)
                for idx, plant in items
            }
            completed = 0
            for future in as_completed(futures):
                orig_idx, plant = futures[future]
                try:
                    results[orig_idx] = future.result()
                except requests.HTTPError as e:
                    # 429 Wikidata → retry plus tard
                    if e.response is not None and e.response.status_code == 429:
                        to_retry.append((orig_idx, plant))
                    else:
                        plant["error"] = str(e)
                        results[orig_idx] = plant
                except Exception as e:
                    plant["error"] = str(e)
                    results[orig_idx] = plant

                completed += 1
                if completed % SAVE_EVERY == 0:
                    _autosave(results, completed, total)

    run_batch(list(enumerate(plants)))

    if to_retry:
        print(f"\n=== RETRY 429 Wikidata ({len(to_retry)} centrales) — pause 15 s ===")
        time.sleep(15)
        run_batch(to_retry)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Sauvegardé : {OUTPUT_JSON}  ({total} entrées)")


def _autosave(results, completed, total):
    tmp = OUTPUT_JSON + ".tmp"
    snapshot = [r if r is not None else {} for r in results]
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    done = sum(1 for r in results if r is not None)
    print(f"[autosave] {completed}/{total} soumises, {done} terminées → {tmp}")


if __name__ == "__main__":
    main()