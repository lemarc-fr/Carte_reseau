"""
Construit les jeux de données finaux des filières décrites par le registre national
ODRE (installations raccordées, sans coordonnées) : éolien, solaire, thermique,
bioénergies, batteries, énergies marines.

- Installations regroupées par commune et par filière, placées au centre de la
  commune (API geo.api.gouv.fr). France métropolitaine seulement.
- Sites de moins de MIN_SITE_MW ignorés sur la carte (petit solaire diffus...), leur
  production reste comptée dans les totaux nationaux publiés par RTE.
- Parcs éoliens en mer : regroupés par ferme, positions et noms dans patches_wind.json.
- Les installations d'au moins UNIT_MIN_MW sont listées comme groupes : RTE publie
  leur production individuelle quand elle dépasse 100 MW (rattachement par code EIC).

Usage (depuis dataset/fr/scripts) :
    python registre.py
"""

import argparse
import json
import urllib.request
from collections import defaultdict
from pathlib import Path

COMMUNES_URL = "https://geo.api.gouv.fr/communes?fields=code,nom,centre,codeRegion&format=json"
HERE = Path(__file__).parent
REGISTRE_DIR = HERE.parent / "raw" / "ordre_per_filiere"
FINAL_DIR = HERE.parent / "final"

MIN_SITE_MW = 1.0
UNIT_MIN_MW = 100.0

# Sites connus sous un autre nom que leur commune : identifiant -> (nom, nom complet)
SITE_NAMES = {
    "marin-35241": ("Rance", "Usine marémotrice de la Rance"),
}


# Filière du registre -> (fichier final, type de production, préfixe d'identifiant, libellé)
def classify(filiere: str, entry: dict):
    tech = entry.get("technologie") or ""
    fuel = entry.get("combustible") or ""
    if filiere == "EOLIE":
        if tech == "Photovoltaïque":  # quelques fiches mal classées
            return None
        if tech.startswith("En mer"):
            return ("WIND", "WIND", "offshore", "Éolien en mer")
        return ("WIND", "WIND", "eolien", "Éolien terrestre")
    if filiere == "SOLAI":
        return ("SOLAR", "SOLAR", "solaire", "Solaire")
    if filiere == "THERM":
        if fuel == "Gaz":
            return ("THERMAL", "GAS", "gaz", "Gaz")
        if fuel == "Fioul":
            return ("THERMAL", "OIL", "fioul", "Fioul")
        if fuel == "Charbon":
            return ("THERMAL", "COAL", "charbon", "Charbon")
        if fuel.startswith("Déchets"):
            return ("BIOENERGY", "BIOENERGY", "bioenergie", "Bioénergies")
        return None  # combustible non renseigné
    if filiere == "BIOEN":
        return ("BIOENERGY", "BIOENERGY", "bioenergie", "Bioénergies")
    if filiere == "STOCK":
        if tech == "Photovoltaïque":
            return None
        return ("BATTERY", "BATTERY", "batterie", "Batteries")
    if filiere == "MARIN":
        return ("MARINE", "HYDRO", "marin", "Énergies marines")
    return None


def technology(production_type: str, entries: list):
    techs = [e.get("technologie") for e in entries if e.get("technologie")]
    if production_type == "BIOENERGY":
        techs = [e.get("combustible") for e in entries if e.get("combustible")] or techs
    return max(set(techs), key=techs.count) if techs else None


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def capacity_mw(entry: dict) -> float:
    return (entry.get("maxpuis") or entry.get("puismaxinstallee") or 0) / 1000


def earliest(dates):
    dates = [d for d in dates if d]
    return min(dates) if dates else None


def units_of(entries: list, site_name: str) -> list:
    big = sorted((e for e in entries if capacity_mw(e) >= UNIT_MIN_MW), key=lambda e: e.get("nominstallation") or "")
    return [
        {
            "eic_code": e["codeeicresourceobject"],
            "name": f"{site_name} {i + 1}",
            "capacity_mw": round(capacity_mw(e), 3),
            "commissioning_date": e.get("datemiseenservice_date"),
        }
        for i, e in enumerate(big)
        if e.get("codeeicresourceobject")
    ]


def offshore_sites(entries: list, patches: list) -> list:
    sites = []
    for patch in patches:
        members = [e for e in entries if patch["match"] in (e.get("nominstallation") or "")]
        units = units_of(members, patch["name"]) + [
            {**u, "name": f"{patch['name']} {len(members) + i + 1}"} for i, u in enumerate(patch.get("extra_units", []))
        ]
        if not members and not units:
            print(f"⚠️  Aucune installation pour {patch['name']}")
            continue
        ref = members[0] if members else {}
        sites.append({
            "id": patch["id"],
            "name": patch["name"],
            "full_name": patch["full_name"],
            "production_type": "WIND",
            "technology": "offshore",
            "commune": ref.get("commune"),
            "departement": ref.get("departement"),
            "region": ref.get("region"),
            "region_code": ref.get("coderegion"),
            "latitude": patch["latitude"],
            "longitude": patch["longitude"],
            "capacity_mw": round(sum(capacity_mw(e) for e in members) + sum(u["capacity_mw"] for u in patch.get("extra_units", [])), 3),
            "commissioning_date": earliest(e.get("datemiseenservice_date") for e in members),
            "installations": len(members) + len(patch.get("extra_units", [])),
            "units": units,
        })
    return sites


def commune_sites(groups: dict, communes: dict, stats: dict) -> list:
    sites = []
    for (code, production_type, prefix, label), entries in groups.items():
        commune = communes.get(code)
        capacity = sum(capacity_mw(e) for e in entries)
        if not commune or not commune.get("centre"):
            stats["sans commune"] += capacity
            continue
        if capacity < MIN_SITE_MW:
            stats[f"{label} < {MIN_SITE_MW:g} MW"] += capacity
            continue
        lon, lat = commune["centre"]["coordinates"]
        n = len(entries)
        site_id = f"{prefix}-{code}"
        name, full_name = SITE_NAMES.get(
            site_id, (commune["nom"], f"{label} à {commune['nom']} ({n} installation{'s' if n > 1 else ''})")
        )
        sites.append({
            "id": site_id,
            "name": name,
            "full_name": full_name,
            "production_type": production_type,
            "technology": "onshore" if prefix == "eolien" else technology(production_type, entries),
            "commune": commune["nom"],
            "departement": entries[0].get("departement"),
            "region": entries[0].get("region"),
            "region_code": entries[0].get("coderegion") or commune.get("codeRegion"),
            "latitude": lat,
            "longitude": lon,
            "capacity_mw": round(capacity, 3),
            "commissioning_date": earliest(e.get("datemiseenservice_date") for e in entries),
            "installations": n,
            "units": units_of(entries, name),
        })
    return sites


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--registre", default=str(REGISTRE_DIR))
    parser.add_argument("--patches", default=str(HERE / "patches_wind.json"))
    parser.add_argument("--output", default=str(FINAL_DIR))
    args = parser.parse_args()

    with urllib.request.urlopen(COMMUNES_URL, timeout=60) as resp:
        communes = {c["code"]: c for c in json.load(resp)}

    outputs = defaultdict(list)
    groups = defaultdict(list)
    offshore = []
    stats = defaultdict(float)
    for filiere in ["EOLIE", "SOLAI", "THERM", "BIOEN", "STOCK", "MARIN"]:
        for entry in load_json(Path(args.registre) / f"{filiere}.json"):
            # En service, France métropolitaine (les régions d'outre-mer ont les codes 01 à 06)
            if entry.get("regime") != "En service" or (entry.get("coderegion") or "99") <= "06":
                continue
            kind = classify(filiere, entry)
            if kind is None:
                stats["filière indéterminée"] += capacity_mw(entry)
                continue
            output, production_type, prefix, label = kind
            if prefix == "offshore":
                offshore.append(entry)
                continue
            code = entry.get("codeinseecommune") or entry.get("codeinseecommuneimplantation")
            groups[(code, production_type, prefix, label)].append(entry)

    files = ["BATTERY", "BIOENERGY", "MARINE", "SOLAR", "THERMAL", "WIND"]
    file_of = {"WIND": "WIND", "SOLAR": "SOLAR", "GAS": "THERMAL", "OIL": "THERMAL", "COAL": "THERMAL",
               "BIOENERGY": "BIOENERGY", "BATTERY": "BATTERY", "HYDRO": "MARINE"}
    for site in offshore_sites(offshore, load_json(args.patches)) + commune_sites(groups, communes, stats):
        outputs[file_of[site["production_type"]]].append(site)

    for name in files:
        sites = sorted(outputs[name], key=lambda s: -s["capacity_mw"])
        with open(Path(args.output) / f"{name}.json", "w", encoding="utf-8") as f:
            json.dump(sites, f, ensure_ascii=False, indent=1)
        print(f"✅ {name:10} {len(sites):5} sites  {sum(s['capacity_mw'] for s in sites):9,.0f} MW  "
              f"{sum(len(s['units']) for s in sites):3} groupes ≥ {UNIT_MIN_MW:g} MW")
    for reason, mw in sorted(stats.items()):
        print(f"   écarté — {reason} : {mw:,.0f} MW")


if __name__ == "__main__":
    main()
