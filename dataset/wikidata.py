import json
import time
import requests

INPUT_JSON = "france_power_plants.json"
OUTPUT_JSON = "france_power_plants_enriched.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}


# =========================
# Helpers Wikidata
# =========================

def get_claim(entity, prop):
    """
    Retourne la liste des claims d'une propriété Wikidata
    """
    return entity.get("claims", {}).get(prop, [])


def get_string_claims(entity, prop):
    values = []

    for claim in get_claim(entity, prop):
        try:
            value = claim["mainsnak"]["datavalue"]["value"]
            values.append(value)
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
    """
    Extrait une date Wikidata
    ex: +1980-03-13T00:00:00Z
    """

    try:
        claim = get_claim(entity, prop)[0]

        raw = claim["mainsnak"]["datavalue"]["value"]["time"]

        return raw.replace("+", "").replace("T00:00:00Z", "")

    except Exception:
        return None


# =========================
# Enrichissement Wikidata
# =========================

def enrich_from_wikidata(wikidata_id):
    url = f"https://www.wikidata.org/wiki/Special:EntityData/{wikidata_id}.json"

    response = requests.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()

    data = response.json()

    entity = data["entities"][wikidata_id]

    enriched = {}

    # =========================
    # Coordonnées GPS
    # P625
    # =========================

    coords = get_coordinate_claim(entity)

    if coords:
        enriched["latitude"] = coords["latitude"]
        enriched["longitude"] = coords["longitude"]

    # =========================
    # Date de mise en service
    # P729 = service entry
    # fallback P571 = inception
    # =========================

    commissioning_date = get_time_claim(entity, "P729")

    if not commissioning_date:
        commissioning_date = get_time_claim(entity, "P571")

    enriched["commissioning_date"] = commissioning_date

    # =========================
    # Puissance MW
    # P2109
    # =========================

    power_mw = get_quantity_claim(entity, "P2109")

    enriched["power_mw"] = power_mw

    # =========================
    # Tous les EIC
    # P8645
    # =========================

    eics = get_string_claims(entity, "P8645")

    enriched["eics"] = eics

    return enriched


# =========================
# MAIN
# =========================

def main():

    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        plants = json.load(f)

    total = len(plants)

    for index, plant in enumerate(plants, start=1):

        wikidata_id = plant.get("wikidata_id")

        print(f"[{index}/{total}] {plant.get('name')}")

        if not wikidata_id:
            continue

        try:
            enrichment = enrich_from_wikidata(wikidata_id)

            plant["wikidata_details"] = enrichment
        except KeyboardInterrupt:
            break
        except Exception as e:
            print("Erreur:", e)
            plant["wikidata_error"] = str(e)

        time.sleep(0.2)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(plants, f, ensure_ascii=False, indent=2)

    print(f"\nFichier sauvegardé: {OUTPUT_JSON}")


if __name__ == "__main__":
    main()