"""
Construit les jeux de données des centrales européennes d'au moins 100 MW (hors France,
décrite plus finement par dataset/fr) à partir de powerplantmatching (PyPSA), qui
rassemble et dédoublonne les registres nationaux, ENTSO-E, JRC, OpenStreetMap, GEM… avec
positions et codes EIC.

- Centrales d'au moins SITE_MIN_MW, toute l'Europe : c'est aussi le seuil de publication
  de la production par groupe d'ENTSO-E.
- Leurs codes EIC sont listés comme groupes, rattachés à cette production.
- Installations fermées (DateOut passée) et filières absentes de la carte (géothermie,
  stockage thermique ou hydrogène…) écartées.

Sortie : dataset/<pays>/final/PLANTS.json (même format que dataset/fr/final/WIND.json).

Usage (depuis dataset/eu/scripts) :
    python3 powerplantmatching.py
"""

import ast
import csv
import json
import re
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE.parent / "raw" / "powerplants.csv"
DATASET_DIR = HERE.parent.parent

SITE_MIN_MW = 100.0

# Pays de powerplantmatching -> code ISO (France exclue). Ceux qui figurent aussi dans
# src/lib/power/entsoe/countries.ts reçoivent la production publiée par ENTSO-E.
COUNTRIES = {
    "Austria": "AT", "Belgium": "BE", "Bulgaria": "BG", "Switzerland": "CH", "Czechia": "CZ",
    "Germany": "DE", "Denmark": "DK", "Estonia": "EE", "Spain": "ES", "Finland": "FI",
    "Greece": "GR", "Croatia": "HR", "Hungary": "HU", "Ireland": "IE", "Italy": "IT",
    "Lithuania": "LT", "Luxembourg": "LU", "Latvia": "LV", "Netherlands": "NL", "Norway": "NO",
    "Poland": "PL", "Portugal": "PT", "Romania": "RO", "Serbia": "RS", "Sweden": "SE",
    "Slovenia": "SI", "Slovakia": "SK", "Ukraine": "UA",
    "Bosnia and Herzegovina": "BA", "North Macedonia": "MK", "Albania": "AL",
    "Montenegro": "ME", "Moldova": "MD", "Kosovo": "XK",
}

def classify(fuel: str, tech: str):
    """(filière du site, type ENTSO-E de ses groupes, technologie affichée) ou None."""
    if fuel == "Nuclear":
        return "NUCLEAR", "NUCLEAR", None
    if fuel == "Hydro":
        if tech == "Pumped Storage":
            return "PUMPED_STORAGE", "HYDRO_PUMPED_STORAGE", None
        if tech == "Run-Of-River":
            return "HYDRO", "HYDRO_RUN_OF_RIVER_AND_POUNDAGE", "Fil de l'eau"
        return "HYDRO", "HYDRO_WATER_RESERVOIR", "Lac" if tech == "Reservoir" else None
    if fuel == "Wind":
        offshore = tech == "Offshore"
        return "WIND", "WIND_OFFSHORE" if offshore else "WIND_ONSHORE", "offshore" if offshore else "onshore"
    if fuel == "Solar":
        return "SOLAR", "SOLAR", None
    if fuel == "Natural Gas":
        return "GAS", "FOSSIL_GAS", tech or None
    if fuel == "Hard Coal":
        return "COAL", "FOSSIL_HARD_COAL", None
    if fuel == "Lignite":
        return "COAL", "FOSSIL_BROWN_COAL_LIGNITE", "Lignite"
    if fuel == "Oil":
        return "OIL", "FOSSIL_OIL", None
    if fuel in ("Solid Biomass", "Biogas"):
        return "BIOENERGY", "BIOMASS", fuel == "Biogas" and "Biogaz" or None
    if fuel == "Waste":
        return "BIOENERGY", "WASTE", "Déchets"
    if fuel == "Battery":
        return "BATTERY", "BATTERY", None
    return None


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "site"


def eic_codes(field: str) -> list[str]:
    """Colonne EIC : représentation Python d'un ensemble, ex. "{'48WSTN00000CRUAC'}"."""
    if not field or field == "set()":
        return []
    try:
        codes = ast.literal_eval(field)
    except (ValueError, SyntaxError):
        return []
    return sorted(c.strip() for c in codes if isinstance(c, str) and c.strip())


def number(value: str):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def main():
    this_year = date.today().year
    sites = defaultdict(list)  # pays -> sites
    used_ids = set()
    used_eics = set()

    with RAW.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    # Plus grosses d'abord : un code EIC partagé reste à la centrale principale, identifiants stables
    rows.sort(key=lambda r: (-(number(r["Capacity"]) or 0), r["Name"]))

    for row in rows:
        country = COUNTRIES.get(row["Country"])
        kind = classify(row["Fueltype"], row["Technology"])
        capacity = number(row["Capacity"])
        lat, lon = number(row["lat"]), number(row["lon"])
        date_out = number(row["DateOut"])
        if not country or not kind or not capacity or capacity < SITE_MIN_MW or lat is None or lon is None:
            continue
        if date_out is not None and date_out <= this_year:
            continue
        production_type, unit_type, technology = kind

        name = (row["Name"] or "").strip() or f"Centrale {production_type.lower()}"
        base = f"{country.lower()}-{production_type.lower().replace('_', '-')}-{slug(name)}"
        site_id, n = base, 2
        while site_id in used_ids:
            site_id, n = f"{base}-{n}", n + 1
        used_ids.add(site_id)

        codes = [c for c in eic_codes(row["EIC"]) if c not in used_eics]
        used_eics.update(codes)
        units = [
            {
                "eic_code": code,
                "name": name if len(codes) == 1 else f"{name} {i + 1}",
                "production_type": unit_type,
                # Un seul code : la centrale ; plusieurs : puissance par groupe inconnue
                "capacity_mw": round(capacity, 3) if len(codes) == 1 else None,
                "commissioning_date": None,
            }
            for i, code in enumerate(codes)
        ]
        date_in = number(row["DateIn"])

        sites[country].append({
            "id": site_id,
            "name": name,
            "full_name": name,
            "production_type": production_type,
            "technology": technology,
            "commune": None,
            "departement": None,
            "region": None,
            "region_code": None,
            "latitude": round(lat, 5),
            "longitude": round(lon, 5),
            "capacity_mw": round(capacity, 3),
            "commissioning_date": f"{int(date_in)}-01-01" if date_in and date_in > 1800 else None,
            "installations": None,
            "units": units,
        })

    for country in sorted(set(COUNTRIES.values())):
        country_sites = sorted(sites.get(country, []), key=lambda s: s["id"])
        out_dir = DATASET_DIR / country.lower() / "final"
        if not country_sites:
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        with (out_dir / "PLANTS.json").open("w", encoding="utf-8") as f:
            json.dump(country_sites, f, ensure_ascii=False, indent=1)
            f.write("\n")
        gw = sum(s["capacity_mw"] for s in country_sites) / 1000
        units = sum(len(s["units"]) for s in country_sites)
        print(f"{country}  {len(country_sites):4d} centrales  {units:4d} groupes  {gw:6.1f} GW")


if __name__ == "__main__":
    main()
