#!/usr/bin/env python3
"""
Lecture de : registre-national-installation-production-stockage-electricite-agrege.json
133,998 enregistrements chargés.

10 filière(s) détectée(s) :

  AUTRE (Autre)                       →      40 enregistrements  →  AUTRE.json
  BIOEN (Bioénergies)                 →   1,269 enregistrements  →  BIOEN.json
  EOLIE (Eolien)                      →   2,460 enregistrements  →  EOLIE.json
  GEOTH (Géothermie)                  →       2 enregistrements  →  GEOTH.json
  HYDLQ (Hydraulique)                 →   2,733 enregistrements  →  HYDLQ.json
  MARIN (Energies Marines)            →       4 enregistrements  →  MARIN.json
  NUCLE (Nucléaire)                   →      57 enregistrements  →  NUCLE.json
  SOLAI (Solaire)                     → 125,364 enregistrements  →  SOLAI.json
  STOCK (Stockage non hydraulique)    →     809 enregistrements  →  STOCK.json
  THERM (Thermique non renouvelable)  →   1,260 enregistrements  →  THERM.json

"""
import json
from pathlib import Path
from collections import defaultdict
import argparse

def split_by_filiere(input_path: Path, output_dir: Path) -> None:
    print(f"📂 Lecture de : {input_path}")

    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("Le fichier JSON doit contenir une liste d'objets.")

    print(f"✅ {len(data):,} enregistrements chargés.")

    # Regroupement par codefiliere
    groupes: dict[str, list] = defaultdict(list)
    for record in data:
        code = record.get("codefiliere") or "INCONNU"
        groupes[code].append(record)

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n📊 {len(groupes)} filière(s) détectée(s) :\n")

    for code, records in sorted(groupes.items()):
        # Nom de fichier sûr (retire les caractères spéciaux éventuels)
        safe_code = "".join(c if c.isalnum() or c in "-_" else "_" for c in code)
        out_file = output_dir / f"{safe_code}.json"

        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)

        # Affiche aussi le libellé filiere si disponible
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
        help="Chemin vers le fichier JSON source (défaut : fichier dans le répertoire courant)",
    )
    parser.add_argument(
        "--output-dir",
        default="ordre_per_filiere",
        help="Répertoire de sortie (défaut : ./split_filiere/)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)

    if not input_path.exists():
        raise FileNotFoundError(f"Fichier introuvable : {input_path}")

    split_by_filiere(input_path, output_dir)


if __name__ == "__main__":
    main()