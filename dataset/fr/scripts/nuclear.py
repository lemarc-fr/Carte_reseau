"""
Fusion des EIC d'une liste de centrales avec les données du registre ORE.

Usage:
    python fusion_eic.py --centrales centrales.json --registre registre_ore.json --output result.json
"""

import json
import argparse
from pathlib import Path
from collections import Counter

def apply_patches(centrales: list, patches_path: str) -> list:
    if not Path(patches_path).exists():
        return centrales
    patches = load_json(patches_path)
    patch_map = {p["name"]: p for p in patches}

    result = []
    for c in centrales:
        name = c.get("name", "")
        if name in patch_map:
            patch = patch_map[name]
            c = dict(c)
            c.setdefault("wikidata_details", {})
            c["wikidata_details"] = dict(c["wikidata_details"])
            eics = list(c["wikidata_details"].get("eics", []))
            if "eics_replace" in patch:
                eics = patch["eics_replace"]
                print(f"🔧 Patch replace EIC : {name}")
            if "eics_add" in patch:
                eics = list(set(eics) | set(patch["eics_add"]))
                print(f"🔧 Patch add EIC : {name}")
            c["wikidata_details"]["eics"] = eics
        result.append(c)
    return result

def load_json(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_eic_index(registre: list) -> dict:
    index = {}
    for entry in registre:
        eic = entry.get("codeeicresourceobject")
        if eic:
            index[eic] = entry
    return index


def enrich_centrale(centrale: dict, eic_index: dict) -> dict:
    wikidata = centrale.get("wikidata_details")
    if not wikidata:
        return dict(centrale)

    eics = wikidata.get("eics", [])
    if not eics or not isinstance(eics, list):
        return dict(centrale)

    eic_dict = {eic: eic_index.get(eic) for eic in eics}

    result = dict(centrale)
    result["wikidata_details"] = dict(wikidata)
    result["wikidata_details"]["eics"] = eic_dict
    return result


def count_eics(enriched: list) -> tuple[int, int]:
    total, found = 0, 0
    for c in enriched:
        eics = c.get("wikidata_details", {}).get("eics", {})
        if isinstance(eics, dict):
            total += len(eics)
            found += sum(1 for v in eics.values() if v is not None)
        elif isinstance(eics, list):
            total += len(eics)
            # liste = non enrichie, aucun match connu
    return total, found


def main():
    parser = argparse.ArgumentParser(description="Fusion EIC centrales ↔ registre ORE")
    parser.add_argument("--centrales", default="france_power_plants_enriched_3.json", help="Fichier JSON des centrales")
    parser.add_argument("--registre", default="ordre_per_filiere/NUCLE.json", help="Fichier JSON du registre ORE (liste)")
    parser.add_argument("--output", default="NUCLEAR.json", help="Fichier de sortie")
    args = parser.parse_args()

    centrales = load_json(args.centrales)
    print(f"{len(centrales)} centrales")
    registre = load_json(args.registre)
    print(f"{len(registre)} EIC")
    if isinstance(centrales, dict):
        centrales = [centrales]

    eic_index = build_eic_index(registre)
    print(f"Registre chargé : {len(eic_index)} EIC indexés")
    eic_counts = Counter(
        entry.get("codeeicresourceobject")
        for entry in registre
    )
    nulls = eic_counts.pop(None, 0)
    duplicates = {eic: n for eic, n in eic_counts.items() if n > 1}

    print(f"  dont null            : {nulls}")
    print(f"  dont EIC dupliqués   : {len(duplicates)} EIC concernés")
    print(f"  dont entrées en trop : {sum(n - 1 for n in duplicates.values())}")
    if duplicates:
        top5 = sorted(duplicates.items(), key=lambda x: -x[1])[:5]
        print(f"  top 5 doublons : {top5}")
    centrales = apply_patches(centrales, "patches_nuclear.json")
    enriched = [enrich_centrale(c, eic_index) for c in centrales]

    # Ne garder que les centrales avec au moins un EIC résolu
    enriched = [
        c for c in enriched
        if isinstance(c.get("wikidata_details", {}).get("eics"), dict)
           and any(v is not None for v in c["wikidata_details"]["eics"].values())
    ]

    print(f"Centrales nucléaires identifiées : {len(enriched)}")
    # EIC trouvés dans les centrales enrichies
    eics_utilises = set()
    for c in enriched:
        eics_utilises.update(c["wikidata_details"]["eics"].keys())

    # EIC du registre NUCLE jamais appelés
    eics_registre = set(eic_index.keys())
    eics_non_utilises = eics_registre - eics_utilises
    if eics_non_utilises:
        print(f"\n⚠️  {len(eics_non_utilises)} EIC du registre NUCLE jamais matchés :")
        for eic in sorted(eics_non_utilises):
            rec = eic_index[eic]
            print(f"  {eic} | {rec.get('nominstallation')} | {rec.get('commune')}")

    # Centrales du fichier source avec "nuclear" dans la source mais non retenues
    print(f"\n⚠️  Centrales 'nuclear' non retenues dans le fichier source :")
    for c in centrales:
        source = c.get("source", "")
        if "nuclear" not in source.lower():
            continue
        eics = c.get("wikidata_details", {}).get("eics", [])
        name = c.get("name") or c.get("english_name", "?")
        # Pas dans enriched ?
        if not any(
                c2.get("name") == name or c2.get("english_name") == name
                for c2 in enriched
        ):
            print(f"  {name} | eics wikidata={eics}")

    total_eics, found_eics = count_eics(enriched)
    print(f"EIC traités : {total_eics} | trouvés : {found_eics} | manquants : {total_eics - found_eics}")
    print(f"{len(enriched)} centrales ecrites")
    out_path = Path(args.output)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(enriched, f, ensure_ascii=False, indent=2)
    print(f"Résultat écrit dans : {out_path}")
    noms_connus = {
        "Belleville", "Blayais", "Bugey", "Cattenom", "Chinon",
        "Civaux", "Cruas", "Dampierre", "Flamanville", "Golfech",
        "Gravelines", "Nogent", "Paluel", "Penly", "Saint-Alban",
        "Saint-Laurent", "Tricastin", "Fessenheim", "Chooz"
    }

    print("Centrales enrichies :")
    for c in enriched:
        print(f"  {c.get('name')}")

    print("\nNoms officiels non trouvés :")
    for nom in sorted(noms_connus):
        if not any(nom.lower() in (c.get("name") or "").lower() for c in enriched):
            print(f"  ⚠️  {nom}")
    print("\nRéacteurs par centrale (groupes ORE) :")
    total_reacteurs = 0
    for c in enriched:
        eics = c["wikidata_details"]["eics"]
        # Compter uniquement les EIC résolus (non None)
        nb_reacteurs = sum(1 for v in eics.values() if v is not None)
        total_reacteurs += nb_reacteurs
        name = c.get("name", "?")
        print(f"  {nb_reacteurs} réacteur(s) | {name}")

    print(f"\nTotal réacteurs : {total_reacteurs}")


if __name__ == "__main__":
    main()