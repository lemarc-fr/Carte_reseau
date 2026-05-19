"""
Fusion des EIC d'une liste de centrales avec les données du registre ORE.

Usage:
    python fusion_eic.py --centrales centrales.json --registre registre_ore.json --output result.json

Le registre ORE est attendu sous forme d'une liste de blocs JSON
(un par installation), chacun ayant un champ "codeeicresourceobject".
"""

import json
import argparse
from pathlib import Path


def load_json(path: str) -> any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_eic_index(registre: list[dict]) -> dict[str, dict]:
    """
    Construit un index { eic_code -> bloc_ore } à partir de la liste du registre.
    Si plusieurs entrées partagent le même EIC, la dernière l'emporte (cas rare).
    """
    index = {}
    for entry in registre:
        eic = entry.get("codeeicresourceobject")
        if eic:
            index[eic] = entry
    return index


def enrich_centrale(centrale: dict, eic_index: dict[str, dict]) -> dict:
    """
    Remplace la liste 'eics' d'une centrale par un dict { eic -> données_ore }.
    Les EIC absents du registre reçoivent la valeur None.
    """
    eics: list[str] = centrale.get("wikidata_details", {}).get("eics", [])
    eic_dict = {eic: eic_index.get(eic) for eic in eics}

    # Copie de la centrale avec le dict enrichi
    result = dict(centrale)
    result.setdefault("wikidata_details", {})
    result["wikidata_details"] = dict(centrale["wikidata_details"])
    result["wikidata_details"]["eics"] = eic_dict
    return result


def main():
    parser = argparse.ArgumentParser(description="Fusion EIC centrales ↔ registre ORE")
    parser.add_argument("--centrales", default="france_power_plants_enriched_3.json", help="Fichier JSON des centrales")
    parser.add_argument("--registre", default="registre-national-installation-production-stockage-electricite-agrege.json", help="Fichier JSON du registre ORE (liste)")
    parser.add_argument("--output", default="fusion.json", help="Fichier de sortie")
    args = parser.parse_args()

    # Chargement
    centrales = load_json(args.centrales)
    registre  = load_json(args.registre)

    # Le fichier centrales peut être un dict unique ou une liste
    if isinstance(centrales, dict):
        centrales = [centrales]

    # Construction de l'index EIC
    eic_index = build_eic_index(registre)
    print(f"Registre chargé : {len(eic_index)} EIC indexés")

    # Enrichissement
    enriched = [enrich_centrale(c, eic_index) for c in centrales]

    # Statistiques rapides
    total_eics  = sum(len(c["wikidata_details"]["eics"]) for c in enriched)
    found_eics  = sum(
        sum(1 for v in c["wikidata_details"]["eics"].values() if v is not None)
        for c in enriched
    )
    print(f"EIC traités : {total_eics} | trouvés dans le registre : {found_eics} | manquants : {total_eics - found_eics}")

    # Sauvegarde
    out_path = Path(args.output)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(enriched if len(enriched) > 1 else enriched[0], f, ensure_ascii=False, indent=2)
    print(f"Résultat écrit dans : {out_path}")


if __name__ == "__main__":
    main()