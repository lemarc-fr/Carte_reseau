#!/usr/bin/env python3

import json
import logging
import re

# ── Configuration du logger ──────────────────────────────────────────────────
logging.basicConfig(
    format="%(levelname)s | %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

MW_PATTERNS = [
    (re.compile(r"([\d.,]+)\s*GW", re.I),  1_000),
    (re.compile(r"([\d.,]+)\s*MW", re.I),      1),
    (re.compile(r"([\d.,]+)\s*KW", re.I),  0.001),
    (re.compile(r"([\d.,]+)\s*W\b",  re.I), 0.000_001),
]

def parse_mw(raw: str | int | float | None) -> float | None:
    """Convertit n'importe quelle valeur de puissance en MW (float) ou None."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    raw = str(raw).replace(",", "").strip()
    for pattern, factor in MW_PATTERNS:
        m = pattern.search(raw)
        if m:
            return float(m.group(1)) * factor
    # Dernière tentative : nombre nu → supposé MW
    try:
        return float(raw)
    except ValueError:
        return None


def extract_osm_element_fields(element: dict) -> dict:
    """Extrait type, bounds et members d'un élément OSM."""
    return {
        "type":    element.get("type"),
        "bounds":  element.get("bounds"),
        "members": element.get("members"),
    }


def get_osm_tags(plant: dict) -> dict:
    """Remonte les tags OSM du premier élément disponible."""
    elements = (
        plant.get("detail_page_data", {})
        .get("osm_details", {})
        .get("elements", [])
    )
    if not elements:
        return {}
    return elements[0].get("tags", {})


# ── Validations / logs d'alerte ───────────────────────────────────────────────

def validate_eics(plant: dict, name: str) -> list[str]:
    """
    Vérifie la présence des EIC et leur cohérence entre wikidata et les tags OSM.
    Retourne la liste consolidée (wikidata prioritaire).
    """
    wd_eics: list[str] = plant.get("wikidata_details", {}).get("eics") or []
    osm_tags = get_osm_tags(plant)
    osm_eic_raw = osm_tags.get("ref:entsoe:eic") or osm_tags.get("entsoe:eic")
    osm_eics: list[str] = (
        [e.strip() for e in osm_eic_raw.split(";")] if osm_eic_raw else []
    )
    entsoe_eic = plant.get("detail_page_data", {}).get("entsoe_eic")
    if entsoe_eic:
        entsoe_list = entsoe_eic if isinstance(entsoe_eic, list) else [entsoe_eic]
        osm_eics = list(set(osm_eics + [e for e in entsoe_list if isinstance(e, str)]))

    all_eics = list(set(wd_eics + osm_eics))

    if not all_eics:
        log.error("[%s] Aucun code EIC trouvé (ni wikidata, ni OSM).", name)
        raise
    elif wd_eics and osm_eics:
        wd_set, osm_set = set(wd_eics), set(osm_eics)
        only_wd  = wd_set  - osm_set
        only_osm = osm_set - wd_set
        if only_wd or only_osm:
            log.warning(
                "[%s] EIC divergents — wikidata seul : %s ; OSM seul : %s.",
                name, sorted(only_wd) or "∅", sorted(only_osm) or "∅",
                      )
        raise

    return sorted(all_eics)


def validate_output(plant: dict, name: str) -> float | None:
    """
    Vérifie la cohérence de la puissance entre les différentes sources.
    Retourne la valeur en MW (float) ou None.
    """
    top_level_mw  = parse_mw(plant.get("output"))
    wd_mw         = parse_mw(plant.get("wikidata_details", {}).get("power_mw"))
    osm_tags      = get_osm_tags(plant)
    osm_mw        = parse_mw(osm_tags.get("plant:output:electricity"))

    values = {k: round(v, 1) for k, v in {
        "top_level":  top_level_mw,
        "wikidata":   wd_mw,
        "osm_tags":   osm_mw,
    }.items() if v is not None}

    unique_values = set(values.values())

    if len(unique_values) > 1:
        log.error(
            "[%s] Puissance incohérente entre les sources : %s",
            name,
            {k: f"{v} MW" for k, v in values.items()},
        )
        raise

    # Priorité : wikidata > top_level > OSM
    return wd_mw or top_level_mw or osm_mw


# ── Normalisation d'une centrale ─────────────────────────────────────────────

def normalize_plant(plant: dict) -> dict:
    name = (
            plant.get("english_name")
            or plant.get("name")
            or "<inconnu>"
    )

    # ── Puissance ──
    output_mw = validate_output(plant, name)

    # ── Source (type de carburant) ──
    osm_tags   = get_osm_tags(plant)
    plant_source = (
            plant.get("source")
            or osm_tags.get("plant:source")
    )

    # ── Date de lancement ──
    launch_date = (
            plant.get("wikidata_details", {}).get("commissioning_date")
            or osm_tags.get("start_date")
    )

    # ── Centroïde (wikidata) ──
    wd_details = plant.get("wikidata_details", {})
    lat = wd_details.get("latitude")
    lon = wd_details.get("longitude")
    centroid = {"latitude": lat, "longitude": lon} if (lat and lon) else None

    # ── EIC ──
    eics = validate_eics(plant, name)

    # ── Éléments OSM bruts (type + bounds + members) ──
    elements_raw = (
        plant.get("detail_page_data", {})
        .get("osm_details", {})
        .get("elements", [])
    )
    osm_elements = [extract_osm_element_fields(e) for e in elements_raw]

    return {
        "name":         name,
        "output_mw":    output_mw,
        "plant_source": plant_source,
        "launch_date":  launch_date,
        "centroid":     centroid,
        "eics":         eics,
        "osm_elements": osm_elements,
    }


# ── Point d'entrée ────────────────────────────────────────────────────────────

def main() -> None:
    input_path  = "france_power_plants_enriched_3.json"
    output_path = f"{input_path}_normalized.json"

    with open(input_path, encoding="utf-8") as fh:
        raw = json.load(fh)

    # Accepte un objet unique ou une liste
    plants: list[dict] = raw if isinstance(raw, list) else [raw]

    # ── Normalisation ──
    results: list[dict] = []
    for i, plant in enumerate(plants):
        if not isinstance(plant, dict):
            log.warning("Élément %d ignoré (type inattendu : %s).", i, type(plant))
            continue
        try:
            results.append(normalize_plant(plant))
        except :
            continue

    log.info("%d centrale(s) normalisée(s).", len(results))

    # ── Écriture ──
    output_json = json.dumps(results, ensure_ascii=False, indent=2)
    if output_path:
        with open(output_path, "w", encoding="utf-8") as fh:
            fh.write(output_json)
        log.info("Résultat écrit dans : %s", output_path)
    else:
        print(output_json)


if __name__ == "__main__":
    main()