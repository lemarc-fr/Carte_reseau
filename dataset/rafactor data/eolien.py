"""
Construit le jeu de données final de l'éolien à partir du registre ODRE.

- Parcs terrestres : regroupés par commune (le registre ne donne pas de coordonnées
  et la plupart des noms sont « Confidentiel »), placés au centre de la commune
  (API geo.api.gouv.fr).
- Parcs en mer : regroupés par ferme, positions et noms issus de patches_wind.json.

Usage:
    python eolien.py --registre ordre_per_filiere/EOLIE.json --patches patches_wind.json --output ../Finie/WIND.json
"""

import argparse
import json
import unicodedata
import urllib.request
from collections import defaultdict

COMMUNES_URL = "https://geo.api.gouv.fr/communes?fields=code,nom,centre,codeRegion&format=json"


def load_json(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def slugify(value: str) -> str:
    ascii_value = unicodedata.normalize("NFD", value).encode("ascii", "ignore").decode()
    out = "".join(c if c.isalnum() else "-" for c in ascii_value.lower())
    return "-".join(part for part in out.split("-") if part)


def capacity_mw(entry: dict) -> float:
    return (entry.get("maxpuis") or entry.get("puismaxinstallee") or 0) / 1000


def to_unit(entry: dict) -> dict:
    return {
        "eic_code": entry["codeeicresourceobject"],
        "name": entry.get("nominstallation") or "Installation",
        "capacity_mw": round(capacity_mw(entry), 3),
        "commissioning_date": entry.get("datemiseenservice_date"),
    }


def earliest(dates):
    dates = [d for d in dates if d]
    return min(dates) if dates else None


def build_offshore(entries: list, patches: list) -> list:
    farms = []
    for patch in patches:
        members = [e for e in entries if patch["match"] in (e.get("nominstallation") or "")]
        units = [to_unit(e) for e in members] + patch.get("extra_units", [])
        if not units:
            print(f"⚠️  Aucune installation pour {patch['name']}")
            continue
        ref = members[0] if members else {}
        farms.append({
            "id": patch["id"],
            "name": patch["name"],
            "full_name": patch["full_name"],
            "technology": "offshore",
            "commune": ref.get("commune"),
            "departement": ref.get("departement"),
            "region": ref.get("region"),
            "region_code": ref.get("coderegion"),
            "latitude": patch["latitude"],
            "longitude": patch["longitude"],
            "capacity_mw": round(sum(u["capacity_mw"] for u in units), 3),
            "commissioning_date": earliest(u["commissioning_date"] for u in units),
            "installations": len(units),
            "units": units,
        })
    return farms


def build_onshore(entries: list, communes: dict) -> list:
    by_commune = defaultdict(list)
    for e in entries:
        code = e.get("codeinseecommune") or e.get("codeinseecommuneimplantation")
        if code:
            by_commune[code].append(e)
        else:
            print(f"⚠️  Sans commune : {e.get('codeeicresourceobject')}")

    plants, missing = [], 0
    for code, members in by_commune.items():
        commune = communes.get(code)
        if not commune or not commune.get("centre"):
            missing += 1
            continue
        lon, lat = commune["centre"]["coordinates"]
        name = commune["nom"]
        n = len(members)
        plants.append({
            "id": f"eolien-{code}",
            "name": name,
            "full_name": f"Éolien terrestre à {name} ({n} installation{'s' if n > 1 else ''})",
            "technology": "onshore",
            "commune": name,
            "departement": members[0].get("departement"),
            "region": members[0].get("region"),
            "region_code": members[0].get("coderegion") or commune.get("codeRegion"),
            "latitude": lat,
            "longitude": lon,
            "capacity_mw": round(sum(capacity_mw(e) for e in members), 3),
            "commissioning_date": earliest(e.get("datemiseenservice_date") for e in members),
            "installations": n,
            "units": [],  # pas de production publiée par installation : estimée par région
        })
    if missing:
        print(f"⚠️  {missing} commune(s) introuvable(s) dans geo.api.gouv.fr")
    return plants


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--registre", default="ordre_per_filiere/EOLIE.json")
    parser.add_argument("--patches", default="patches_wind.json")
    parser.add_argument("--output", default="../Finie/WIND.json")
    args = parser.parse_args()

    registre = [e for e in load_json(args.registre) if e.get("regime") == "En service"]
    # Quelques fiches de la filière éolienne sont déclarées en photovoltaïque : on les écarte
    registre = [e for e in registre if e.get("technologie") != "Photovoltaïque"]
    offshore = [e for e in registre if (e.get("technologie") or "").startswith("En mer")]
    onshore = [e for e in registre if not (e.get("technologie") or "").startswith("En mer")]

    with urllib.request.urlopen(COMMUNES_URL, timeout=60) as resp:
        communes = {c["code"]: c for c in json.load(resp)}

    plants = build_offshore(offshore, load_json(args.patches)) + build_onshore(onshore, communes)
    plants.sort(key=lambda p: -p["capacity_mw"])

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(plants, f, ensure_ascii=False, indent=1)

    total = sum(p["capacity_mw"] for p in plants)
    print(f"✅ {len(plants)} sites éoliens ({sum(p['technology'] == 'offshore' for p in plants)} en mer), "
          f"{sum(p['installations'] for p in plants)} installations, {total:,.0f} MW → {args.output}")


if __name__ == "__main__":
    main()
