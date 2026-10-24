#!/usr/bin/env python3
"""
Lecture de : registre-national-installation-production-stockage-electricite-agrege.json
Split par filière + suppression des enregistrements sans EIC.
Les enregistrements sans EIC dont le nom n'est pas dans NOMS_SILENCIEUX sont loggés en erreur.
"""
import json
import logging
from pathlib import Path
from collections import defaultdict
import argparse

# Noms pour lesquels l'absence d'EIC est normale (pas de log d'erreur)
NOMS_SILENCIEUX = {
    "Agrégation des installations de moins de 36KW",
    "Confidentiel",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


def filter_without_eic(records: list[dict]) -> tuple[list[dict], int, int]:
    """
    Retourne (records_avec_eic, nb_silencieux_supprimés, nb_erreurs_loggées).
    """
    kept = []
    nb_silencieux = 0
    nb_erreurs = 0

    for record in records:
        eic = record.get("codeeicresourceobject")
        if eic:
            kept.append(record)
            continue

        nom = record.get("nominstallation", "")
        if nom in NOMS_SILENCIEUX:
            nb_silencieux += 1
        else:
            nb_erreurs += 1
            logger.error(
                "EIC manquant — filière=%s | nom=%r",
                record.get("codefiliere", "?"),
                nom,
            )

    return kept, nb_silencieux, nb_erreurs


def split_by_filiere(input_path: Path, output_dir: Path) -> None:
    print(f"📂 Lecture de : {input_path}")

    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("Le fichier JSON doit contenir une liste d'objets.")

    print(f"✅ {len(data):,} enregistrements chargés.")

    # Filtrage global des enregistrements sans EIC
    data, nb_silencieux, nb_erreurs = filter_without_eic(data)
    print(
        f"🔍 Filtrés sans EIC : {nb_silencieux} silencieux supprimés"
        f", {nb_erreurs} erreurs loggées"
        f" → {len(data):,} enregistrements conservés."
    )
    with open(input_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Regroupement par codefiliere
    groupes: dict[str, list] = defaultdict(list)
    for record in data:
        code = record.get("codefiliere") or "INCONNU"
        groupes[code].append(record)

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n📊 {len(groupes)} filière(s) détectée(s) :\n")

    for code, records in sorted(groupes.items()):
        safe_code = "".join(c if c.isalnum() or c in "-_" else "_" for c in code)
        out_file = output_dir / f"{safe_code}.json"

        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)

        filiere_label = records[0].get("filiere", "")
        label = f" ({filiere_label})" if filiere_label else ""
        print(f"  {code}{label:30s} → {len(records):>7,} enregistrements  →  {out_file.name}")

    print(f"\n✅ Fichiers écrits dans : {output_dir.resolve()}")


def main():
    parser = argparse.ArgumentParser(
        description="Split le registre national des installations électriques par codefiliere."
    )
    parser.add_argument(
        "--input",
        default="registre-national-installation-production-stockage-electricite-agrege.json",
        help="Chemin vers le fichier JSON source",
    )
    parser.add_argument(
        "--output-dir",
        default="ordre_per_filiere",
        help="Répertoire de sortie",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)

    if not input_path.exists():
        raise FileNotFoundError(f"Fichier introuvable : {input_path}")

    split_by_filiere(input_path, output_dir)


if __name__ == "__main__":
    main()