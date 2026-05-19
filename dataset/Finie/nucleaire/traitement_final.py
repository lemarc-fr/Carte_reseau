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


def short_name(nominstallation):
    """'GRAV5N05 - GROUPE 05 DE LA CENTRALE ...' → 'GRAV5N05'"""
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

    plant = {
        "id":                 raw.get("wikidata_id"),
        "name":               raw.get("name"),
        "english_name":       raw.get("english_name"),
        "operator":           raw.get("operator"),
        "source":             raw.get("source"),
        "latitude":           wd.get("latitude"),
        "longitude":          wd.get("longitude"),
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
        print(f"✓ Écrit dans {output_path}")
    else:
        print(out_json)

if __name__ == "__main__":
    process("NUCLEAR_rich.json", "NUCLEAR.json")