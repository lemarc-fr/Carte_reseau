import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Semaphore
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from tqdm import tqdm

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
INPUT_JSON = "france_power_plants.json"
OUTPUT_JSON = "france_power_plants_enriched_3.json"
OSM_USER_AGENT = "france-power-plants-enricher/1.0 "

# Limites par API pour éviter les 429
OVERPASS_SEMAPHORE = Semaphore(3)   # Overpass est le plus fragile
WIKIDATA_SEMAPHORE = Semaphore(8)
DETAIL_SEMAPHORE   = Semaphore(10)

SAVE_EVERY = 50  # Plus fréquent

def make_session():
    s = requests.Session()
    s.headers.update({"User-Agent": OSM_USER_AGENT, "Referer": "http://lemarc.fr"})
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
    out geom;
    """ # TODO : add >>; before geom
    with OVERPASS_SEMAPHORE:
        r = SESSION.post(OVERPASS_URL, data={"data": query}, timeout=60)
    r.raise_for_status()
    data = r.json()
    return data


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
            with tqdm(total=total) as pbar:
                for future in as_completed(futures):
                    orig_idx, plant = futures[future]
                    try:
                        results[orig_idx] = future.result()
                    except requests.HTTPError as e:
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
                    pbar.update(1)

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

def main_retry_wikidata():
    with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
        plants = json.load(f)
    plants_to_correct = []
    for plant in plants:
        try :
            if plant["wikidata_error"]:
                plants_to_correct.append(plant)
        except :
            pass
    print("generate newplant")
    newplant = []
    newplant.append(process_plant(1, 2, plants_to_correct[0]))
    newplant.append(process_plant(2,2, plants_to_correct[1]))
    print(len(plants_to_correct))
    for plant in plants:
        try:
            if plant["name"] == newplant[0]["name"]:
                print(plant["name"])
                for key in plant.keys():
                    try:
                        plant[key] = newplant[0][key]
                    except Exception as e:
                        print(e)
                del plant["wikidata_error"]
            if plant["name"] == newplant[1]["name"]:
                print(plant["name"])
                for key in plant.keys():
                    try:
                        plant[key] = newplant[1][key]
                    except Exception as e:
                        print(e)
                del plant["wikidata_error"]
        except Exception as e:
            print(e)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(plants, f, ensure_ascii=False, indent=2)

def main_retry_overpass():
    with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
        plants = json.load(f)

    # Centrales avec une detail_page_error liée à Overpass
    OVERPASS_ERRORS = ("429", "504", "ConnectionReset", "Connection aborted", "HTTPSConnectionPool")
    to_fix = [
        (i, p) for i, p in enumerate(plants)
        if "detail_page_error" in p
           and any(tag in p["detail_page_error"] for tag in OVERPASS_ERRORS)
    ]
    print(f"{len(to_fix)} centrales à relancer via Overpass")

    results = {}  # idx → plant enrichi ou erreur

    def retry_one(idx, plant):
        """Récupère uniquement osm_details pour une centrale déjà partiellement enrichie."""
        # L'URL OSM peut être dans detail_page_data si la detail page avait réussi
        # mais Overpass avait échoué, ou absente si la detail page elle-même a échoué.
        dpd = plant.get("detail_page_data") or {}
        osm_url = dpd.get("openstreetmap_url")

        if not osm_url:
            # La detail page entière a échoué : on la refait complètement
            detail_url = plant.get("detail_url")
            if not detail_url:
                return idx, plant, "no_detail_url"
            try:
                plant["detail_page_data"] = enrich_from_detail_page(detail_url)
                plant.pop("detail_page_error", None)
                return idx, plant, "ok"
            except Exception as e:
                plant["detail_page_error"] = str(e)
                return idx, plant, f"error: {e}"

        # On a déjà l'URL OSM : on relance uniquement Overpass
        try:
            osm_details = enrich_from_openstreetmap(osm_url)
            plant["detail_page_data"]["osm_details"] = osm_details
            plant.pop("detail_page_error", None)
            return idx, plant, "ok"
        except Exception as e:
            plant["detail_page_error"] = str(e)
            return idx, plant, f"error: {e}"

    # Workers intentionnellement bas : Overpass ne supporte pas la concurrence élevée
    MAX_WORKERS = 2

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(retry_one, idx, plant): (idx, plant)
            for idx, plant in to_fix
        }
        ok_count = 0
        err_count = 0
        with tqdm(total=len(to_fix), desc="Overpass retry") as pbar:
            for future in as_completed(futures):
                idx, plant, status = future.result()
                plants[idx] = plant
                if status == "ok":
                    ok_count += 1
                else:
                    err_count += 1
                    print(status)

                pbar.set_postfix(ok=ok_count, err=err_count)
                pbar.update(1)

                # Pause entre chaque requête Overpass terminée — essentiel
                time.sleep(2)

                # Autosave tous les 20
                if (ok_count + err_count) % 20 == 0:
                    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
                        json.dump(plants, f, ensure_ascii=False, indent=2)
                    tqdm.write(f"[autosave] {ok_count+err_count}/{len(to_fix)}")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(plants, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Terminé — {ok_count} succès, {err_count} échecs restants")

main()
for _ in range(5):
    main_retry_overpass()