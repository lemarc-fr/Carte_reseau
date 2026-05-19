"""
simplify_plants.py
------------------
Transforme le JSON brut openinframap/wikidata en objets minimalistes
pour une carte de production en temps réel.

Format de sortie par centrale :
  id, name, english_name, operator, source, latitude, longitude,
  power_mw, commissioning_date, wikidata_url, units[]

Format de sortie par unité :
  eic, name, commissioned, status, power_mw, energy_injected_mwh

Priorité pour power_mw d'une unité  : puismaxrac > puismaxinstallee
Priorité pour power_mw de la centrale : somme unités > wikidata > champ texte output
Priorité pour lat/lon               : wikidata_details > centroïde géométrie OSM

Usage :
  python simplify_plants.py <input_brut.json> [output.json]
"""

import json
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_output_mw(output_str):
    """'5,460 MW' → 5460.0"""
    if not output_str:
        return None
    cleaned = output_str.replace(",", "").replace(" ", "").upper()
    m = re.match(r"([\d.]+)MW", cleaned)
    return float(m.group(1)) if m else None


def kw_to_mw(kw):
    return round(kw / 1000, 3) if kw is not None else None


def unit_power_mw(eic_data):
    """puismaxrac (kW) > puismaxinstallee (kW)"""
    for field in ("puismaxrac", "puismaxinstallee"):
        val = eic_data.get(field)
        if val is not None:
            return kw_to_mw(val)
    return None


def plant_power_mw(raw, units):
    """Somme units > wikidata power_mw > champ texte output"""
    powers = [u["power_mw"] for u in units if u.get("power_mw") is not None]
    if powers:
        return round(sum(powers), 3)
    wd_power = raw.get("wikidata_details", {}).get("power_mw")
    if wd_power is not None:
        return float(wd_power)
    return parse_output_mw(raw.get("output"))


def osm_centroid(raw):
    """
    Calcule le centroïde depuis la géométrie OSM.
    Cherche dans tous les éléments OSM (way ou relation/members).
    Retourne (lat, lon) arrondis à 6 décimales, ou (None, None).
    """
    points = []

    elements = (
        raw.get("detail_page_data", {})
        .get("osm_details", {})
        .get("elements", [])
    )

    for element in elements:
        # Way direct : geometry = liste de {lat, lon}
        for pt in element.get("geometry", []):
            lat, lon = pt.get("lat"), pt.get("lon")
            if lat is not None and lon is not None:
                points.append((lat, lon))

        # Relation : members contenant chacun une geometry
        for member in element.get("members", []):
            for pt in member.get("geometry", []):
                lat, lon = pt.get("lat"), pt.get("lon")
                if lat is not None and lon is not None:
                    points.append((lat, lon))

    if not points:
        return None, None

    avg_lat = round(sum(p[0] for p in points) / len(points), 6)
    avg_lon = round(sum(p[1] for p in points) / len(points), 6)
    return avg_lat, avg_lon


def plant_latlon(raw):
    """wikidata_details lat/lon > centroïde OSM"""
    wd = raw.get("wikidata_details", {})
    lat = wd.get("latitude")
    lon = wd.get("longitude")
    if lat is not None and lon is not None:
        return lat, lon
    return osm_centroid(raw)


def short_name(nominstallation):
    """'CRUA5N02 - GROUPE 02 DE LA CENTRALE ...' → 'CRUA5N02'"""
    if not nominstallation:
        return None
    return nominstallation.split(" - ")[0].strip()


# ---------------------------------------------------------------------------
# Core transform
# ---------------------------------------------------------------------------

def simplify_unit(eic_code, eic_data):
    unit = {"eic": eic_code}

    name = short_name(eic_data.get("nominstallation"))
    if name:
        unit["name"] = name

    unit["commissioned"] = eic_data.get("datemiseenservice_date")
    unit["status"]       = eic_data.get("regime")
    unit["power_mw"]     = unit_power_mw(eic_data)

    # Énergie : injectée prioritaire, produite en fallback
    injected = eic_data.get("energieannuelleglissanteinjectee")
    produced = eic_data.get("energieannuelleglissanteproduite")
    energy_kwh = injected if injected is not None else produced
    if energy_kwh is not None:
        unit["energy_injected_mwh"] = round(energy_kwh / 1000, 1)

    return {k: v for k, v in unit.items() if v is not None}


def simplify_plant(raw):
    wd   = raw.get("wikidata_details", {})
    eics = wd.get("eics", {})

    units = [
        simplify_unit(code, data)
        for code, data in eics.items()
        if isinstance(data, dict)
    ]

    lat, lon = plant_latlon(raw)

    plant = {
        "id":                 raw.get("wikidata_id"),
        "name":               raw.get("name"),
        "english_name":       raw.get("english_name"),
        "operator":           raw.get("operator"),
        "source":             raw.get("source"),
        "latitude":           lat,
        "longitude":          lon,
        "power_mw":           plant_power_mw(raw, units),
        "commissioning_date": wd.get("commissioning_date"),
        "wikidata_url":       raw.get("wikidata_url"),
        "units":              units or None,
    }

    return {k: v for k, v in plant.items() if v is not None}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def process(input_path, output_path=None):
    raw_data = json.loads(Path(input_path).read_text(encoding="utf-8"))

    if isinstance(raw_data, list):
        result = [simplify_plant(p) for p in raw_data]
    else:
        result = simplify_plant(raw_data)

    out_json = json.dumps(result, ensure_ascii=False, indent=2)

    if output_path:
        Path(output_path).write_text(out_json, encoding="utf-8")
        print(f"✓ Écrit dans {output_path}", file=sys.stderr)
    else:
        print(out_json)

if __name__ == "__main__":
    process("NUCLEAR_rich.json", "NUCLEAR.json")