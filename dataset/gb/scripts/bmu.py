"""
Construit dataset/gb/final/PLANTS.json : les centrales britanniques d'au moins SITE_MIN_MW,
avec leurs unités du mécanisme d'ajustement (BMU) dont Elexon publie la production
(PN, puis B1610 une fois le règlement publié).

- BMU (référentiel Elexon, raw/elexon_bmunits.json) : unités de production d'une filière
  connue, regroupées en centrales par le radical de leur code National Grid
  (DRAXX-1…6 -> DRAXX, DIDCB5/6 -> DIDCB) et par filière.
- Position et nom de chaque centrale, dans cet ordre :
    1. patches_bmu.json : radical -> nom exact d'une centrale OSM ou powerplantmatching,
       pour les cas que les règles suivantes ratent ou confondent ;
    2. powerplantmatching (eu/raw/powerplants.csv) : son code EIC de centrale contient le
       même radical (48WSTN0000DRAXXK -> DRAXX, à un numéro près) ;
    3. OpenStreetMap (raw/osm_plants.json, power=plant nommées) : mots du nom en commun
       avec ceux des BMU, même filière, puissance compatible.
  Les BMU placées sur la même centrale (parcs en plusieurs tranches) sont réunies.
  Les centrales qui restent introuvables sont listées à la fin (non placées).
- Centrales de powerplantmatching d'au moins SITE_MIN_MW sans BMU (solaire, petites
  unités raccordées au réseau de distribution…) : ajoutées sans groupe, production estimée.

Sorties : final/PLANTS.json, scripts/matches.txt (rapprochements, à relire) et
scripts/unmatched.txt (centrales BMU non placées).

Usage (depuis dataset/gb/scripts) :
    python3 bmu.py
"""

import ast
import csv
import json
import math
import re
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
GB_DIR = HERE.parent
BMUNITS = GB_DIR / "raw" / "elexon_bmunits.json"
OSM = GB_DIR / "raw" / "osm_plants.json"
PPM = GB_DIR.parent / "eu" / "raw" / "powerplants.csv"
PATCHES = HERE / "patches_bmu.json"

SITE_MIN_MW = 100.0

# Filière Elexon -> (filière du site, type ENTSO-E du groupe)
FUEL_TYPES = {
    "CCGT": ("GAS", "FOSSIL_GAS"),
    "OCGT": ("GAS", "FOSSIL_GAS"),
    "COAL": ("COAL", "FOSSIL_HARD_COAL"),
    "OIL": ("OIL", "FOSSIL_OIL"),
    "NUCLEAR": ("NUCLEAR", "NUCLEAR"),
    "WIND": ("WIND", "WIND_ONSHORE"),
    "NPSHYD": ("HYDRO", "HYDRO_RUN_OF_RIVER_AND_POUNDAGE"),
    "PS": ("PUMPED_STORAGE", "HYDRO_PUMPED_STORAGE"),
    "BIOMASS": ("BIOENERGY", "BIOMASS"),
}

# plant:source d'OSM -> filières compatibles
OSM_SOURCES = {
    "gas": {"GAS"}, "oil": {"OIL", "GAS"}, "diesel": {"OIL", "GAS"}, "coal": {"COAL", "BIOENERGY"},
    "nuclear": {"NUCLEAR"}, "wind": {"WIND"}, "hydro": {"HYDRO", "PUMPED_STORAGE"},
    "biomass": {"BIOENERGY", "COAL"}, "biogas": {"BIOENERGY"}, "waste": {"BIOENERGY"},
    "battery": {"BATTERY"},
}

# filière powerplantmatching -> filière du site
PPM_KINDS = {
    "Nuclear": "NUCLEAR", "Wind": "WIND", "Solar": "SOLAR", "Natural Gas": "GAS", "Hard Coal": "COAL",
    "Lignite": "COAL", "Oil": "OIL", "Solid Biomass": "BIOENERGY", "Biogas": "BIOENERGY",
    "Waste": "BIOENERGY", "Battery": "BATTERY",
}

STOPWORDS = {
    "power", "station", "wind", "farm", "windfarm", "offshore", "onshore", "plant", "energy", "ltd",
    "limited", "generation", "generating", "gt", "ccgt", "ocgt", "unit", "units", "main", "export",
    "the", "of", "and", "extension", "phase", "park", "scheme", "hydro", "electric", "centre", "site",
    "project", "array", "bank", "company", "plc", "uk",
    "battery", "storage", "solar", "gas", "turbine", "turbines", "generator", "chp", "cogen", "module",
}


# Distinguent deux tranches (Moray East/West) mais ne suffisent pas à rapprocher deux noms
DIRECTIONS = {"north", "south", "east", "west", "upper", "lower"}


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "site"


def tokens(text: str) -> set[str]:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return {w for w in re.findall(r"[a-z]+", text) if len(w) >= 4 and w not in STOPWORDS}


def meaningful(name: str | None) -> bool:
    """Nom de BMU lisible (pas un code comme « T_GRAI-6 », « Unit 3 », « PNYCW-1 Export »)."""
    if not name:
        return False
    if re.match(r"^[TEC2]_|^unit\b", name, re.I):
        return False
    return bool(tokens(name))


def stem(ng_id: str) -> str:
    """DRAXX-1 -> DRAXX, DIDCB5 -> DIDCB, KLYN-A-1 -> KLYN."""
    return re.sub(r"\d+$", "", ng_id.split("-")[0]) or ng_id


def station_code(eic: str):
    """48WSTN0000DRAXXK -> DRAXX (code EIC de centrale de National Grid)."""
    m = re.match(r"^48WSTN\d*?0*([A-Z][A-Z0-9-]*?)[A-Z0-9]$", eic)
    return m.group(1).rstrip("-") if m else None


def same_station(eic_code: str, bmu_stem: str) -> bool:
    """Même centrale, à un numéro près (HEYM2 / HEYM), pas à une lettre près (BEIN / BEINW)."""
    short, long = sorted((eic_code, bmu_stem), key=len)
    rest = long[len(short):]
    return long.startswith(short) and (rest == "" or rest.isdigit())


def number(value):
    try:
        return float(str(value).replace(",", ".").split()[0])
    except (TypeError, ValueError, IndexError):
        return None


def osm_output_mw(tags: dict):
    value = tags.get("plant:output:electricity", "")
    mw = number(value)
    if mw is None:
        return None
    return mw / 1000 if "kW" in value else mw * 1000 if "GW" in value else mw


def osm_kinds(tags: dict) -> set[str]:
    kinds = set()
    for source in (tags.get("plant:source") or "").split(";"):
        kinds |= OSM_SOURCES.get(source.strip(), set())
    if tags.get("plant:method") == "water-pumped-storage":
        kinds = {"PUMPED_STORAGE"}
    return kinds


def bmu_units(bmus: list[dict], offshore: bool) -> list[dict]:
    return [
        {
            "eic_code": b["elexonBmUnit"],
            "name": b["bmUnitName"] if meaningful(b.get("bmUnitName")) else b["nationalGridBmUnit"],
            "production_type": "WIND_OFFSHORE" if offshore else FUEL_TYPES[b["fuelType"]][1],
            "capacity_mw": round(number(b["generationCapacity"]), 3),
            "commissioning_date": None,
        }
        for b in sorted(bmus, key=lambda b: b["elexonBmUnit"])
    ]


def distance_km(a, b):
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1]) * math.cos(math.radians((a[0] + b[0]) / 2))
    return 6371 * math.hypot(dlat, dlon)


def main():
    this_year = date.today().year
    patches = json.loads(PATCHES.read_text()) if PATCHES.exists() else {}

    # ── Centrales BMU ────────────────────────────────────────────────────────
    stations = defaultdict(list)  # (radical, filière) -> BMU
    seen = set()  # le référentiel contient des doublons
    for bmu in json.loads(BMUNITS.read_text()):
        if bmu.get("elexonBmUnit") in seen:
            continue
        seen.add(bmu.get("elexonBmUnit"))
        fuel = bmu.get("fuelType")
        if fuel not in FUEL_TYPES or not bmu.get("elexonBmUnit") or not bmu.get("nationalGridBmUnit"):
            continue
        capacity = number(bmu.get("generationCapacity")) or 0
        if capacity <= 0:
            continue
        stations[(stem(bmu["nationalGridBmUnit"]), FUEL_TYPES[fuel][0])].append(bmu)

    # ── powerplantmatching ───────────────────────────────────────────────────
    ppm = []
    with PPM.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["Country"] != "United Kingdom":
                continue
            kind = PPM_KINDS.get(row["Fueltype"])
            if row["Fueltype"] == "Hydro":
                kind = "PUMPED_STORAGE" if row["Technology"] == "Pumped Storage" else "HYDRO"
            capacity, lat, lon = number(row["Capacity"]), number(row["lat"]), number(row["lon"])
            date_out = number(row["DateOut"])
            if not kind or not capacity or lat is None or lon is None or (date_out and date_out <= this_year):
                continue
            try:
                codes = ast.literal_eval(row["EIC"]) if row["EIC"] not in ("", "set()") else set()
            except (ValueError, SyntaxError):
                codes = set()
            ppm.append({
                "name": row["Name"].strip(), "kind": kind, "capacity": capacity, "lat": lat, "lon": lon,
                "technology": row["Technology"], "codes": {station_code(c) for c in codes} - {None},
                "date_in": number(row["DateIn"]), "used": False,
            })

    # ── OpenStreetMap ────────────────────────────────────────────────────────
    osm = []
    for el in json.loads(OSM.read_text())["elements"]:
        tags = el.get("tags", {})
        point = el.get("center") or ({"lat": el["lat"], "lon": el["lon"]} if "lat" in el else None)
        if not point or not tags.get("name"):
            continue
        osm.append({
            "name": tags["name"], "tokens": tokens(tags["name"]), "kinds": osm_kinds(tags),
            "mw": osm_output_mw(tags), "lat": point["lat"], "lon": point["lon"],
        })
    osm_by_name = {o["name"]: o for o in osm}

    sites, unmatched, matches, used_ids = [], [], [], set()
    placed = {}  # (nom de la centrale, filière) -> site
    for (code, kind), bmus in sorted(stations.items()):
        capacity = sum(number(b["generationCapacity"]) for b in bmus)
        if capacity < SITE_MIN_MW:
            continue
        names = [b["bmUnitName"] for b in bmus if meaningful(b.get("bmUnitName"))]
        words = set().union(*(tokens(n) for n in names)) if names else set()

        place = None
        # 1. patch manuel
        if code in patches:
            o = osm_by_name.get(patches[code]) or next((p for p in ppm if p["name"] == patches[code]), None)
            if o:
                place = {"name": o["name"], "lat": o["lat"], "lon": o["lon"], "source": "patch"}
            else:
                print(f"patch introuvable : {code} -> {patches[code]}")
        # 2. powerplantmatching par code de centrale, 3. OSM par le nom
        if not place:
            for p in ppm:
                if p["kind"] == kind and any(same_station(c, code) for c in p["codes"]):
                    place = {"name": p["name"], "lat": p["lat"], "lon": p["lon"], "source": "ppm"}
                    p["used"] = True
                    break
        if not place and words:
            best, best_score = None, 0
            for o in osm:
                if kind not in o["kinds"]:
                    continue
                common = words & o["tokens"]
                if not common - DIRECTIONS:
                    continue
                score = len(common)
                if o["mw"] and not (capacity / 4 <= o["mw"] <= capacity * 4):
                    continue
                closeness = -abs(math.log((o["mw"] or capacity) / capacity))
                if (score, closeness) > (best_score, best[1] if best else -99):
                    best, best_score = (o, closeness), score
            if best:
                o = best[0]
                place = {"name": o["name"], "lat": o["lat"], "lon": o["lon"], "source": "osm"}
        if place:
            matches.append(f"{code}\t{kind}\t{capacity:.0f} MW\t{place['source']}\t{place['name']}\t<- {'; '.join(names[:2])}")
        if not place:
            unmatched.append(f"{code}\t{kind}\t{capacity:.0f} MW\t{'; '.join(names[:3]) or bmus[0]['elexonBmUnit']}")
            continue

        # Centrales de powerplantmatching au même endroit : déjà couvertes
        for p in ppm:
            if p["kind"] == kind and distance_km((p["lat"], p["lon"]), (place["lat"], place["lon"])) < 3:
                p["used"] = True

        merged = placed.get((place["name"], kind))
        if merged:
            merged["capacity_mw"] = round(merged["capacity_mw"] + capacity, 3)
            merged["units"] += bmu_units(bmus, merged["technology"] == "offshore")
            merged["units"].sort(key=lambda u: u["eic_code"])
            continue

        name = re.sub(r"\s+(Power Station|Wind Farm|Offshore Wind Farm)$", "", place["name"]).strip() or place["name"]
        site_id = base = f"gb-{kind.lower().replace('_', '-')}-{slug(name)}"
        n = 2
        while site_id in used_ids:
            site_id, n = f"{base}-{n}", n + 1
        used_ids.add(site_id)
        offshore = kind == "WIND" and ("offshore" in place["name"].lower() or any("offshore" in (b.get("bmUnitName") or "").lower() for b in bmus))
        sites.append({
            "id": site_id,
            "name": name,
            "full_name": place["name"],
            "production_type": kind,
            "technology": ("offshore" if offshore else "onshore") if kind == "WIND" else None,
            "commune": None,
            "departement": None,
            "region": bmus[0].get("gspGroupName"),
            "region_code": None,
            "latitude": round(place["lat"], 5),
            "longitude": round(place["lon"], 5),
            "capacity_mw": round(capacity, 3),
            "commissioning_date": None,
            "installations": None,
            "units": bmu_units(bmus, offshore),
        })
        placed[(place["name"], kind)] = sites[-1]

    # Centrales sans BMU
    for p in ppm:
        if p["used"] or p["capacity"] < SITE_MIN_MW:
            continue
        site_id = base = f"gb-{p['kind'].lower().replace('_', '-')}-{slug(p['name'])}"
        n = 2
        while site_id in used_ids:
            site_id, n = f"{base}-{n}", n + 1
        used_ids.add(site_id)
        sites.append({
            "id": site_id, "name": p["name"], "full_name": p["name"], "production_type": p["kind"],
            "technology": {"Offshore": "offshore", "Onshore": "onshore"}.get(p["technology"]),
            "commune": None, "departement": None, "region": None, "region_code": None,
            "latitude": round(p["lat"], 5), "longitude": round(p["lon"], 5),
            "capacity_mw": round(p["capacity"], 3),
            "commissioning_date": f"{int(p['date_in'])}-01-01" if p["date_in"] and p["date_in"] > 1800 else None,
            "installations": None, "units": [],
        })

    sites.sort(key=lambda s: s["id"])
    out = GB_DIR / "final" / "PLANTS.json"
    out.parent.mkdir(exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        json.dump(sites, f, ensure_ascii=False, indent=1)
        f.write("\n")
    (HERE / "matches.txt").write_text("\n".join(matches) + "\n")
    (HERE / "unmatched.txt").write_text("\n".join(sorted(unmatched, key=lambda l: -float(l.split("\t")[2].split()[0]))) + "\n")

    with_units = [s for s in sites if s["units"]]
    print(f"{len(sites)} centrales, dont {len(with_units)} avec {sum(len(s['units']) for s in with_units)} BMU "
          f"({sum(s['capacity_mw'] for s in with_units) / 1000:.1f} GW) ; {len(unmatched)} centrales BMU non placées "
          f"({sum(float(l.split(chr(9))[2].split()[0]) for l in unmatched) / 1000:.1f} GW, voir unmatched.txt)")


if __name__ == "__main__":
    main()
