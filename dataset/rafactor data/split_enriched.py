"""
  ✓ nuclear              → nuclear.json  (18 centrale(s))
  ✓ coal;biomass         → coal;biomass.json  (2 centrale(s))
  ✓ hydro                → hydro.json  (885 centrale(s))
  ✓ gas                  → gas.json  (133 centrale(s))
  ✓ oil                  → oil.json  (14 centrale(s))
  ✓ wind                 → wind.json  (1849 centrale(s))
  ✓ solar                → solar.json  (1884 centrale(s))
  ✓ tidal                → tidal.json  (1 centrale(s))
  ✓ diesel               → diesel.json  (4 centrale(s))
  ✓ oil;gas              → oil;gas.json  (2 centrale(s))
  ✓ biomass              → biomass.json  (284 centrale(s))
  ✓ battery              → battery.json  (12 centrale(s))
  ✓ waste                → waste.json  (123 centrale(s))
  ✓ biomass;gas          → biomass;gas.json  (34 centrale(s))
  ✓ gas;biomass          → gas;biomass.json  (12 centrale(s))
  ✓ coal;gas             → coal;gas.json  (1 centrale(s))
  ✓ geothermal;gas       → geothermal;gas.json  (5 centrale(s))
  ✓ biogas               → biogas.json  (21 centrale(s))
  ✓ solar;battery        → solar;battery.json  (2 centrale(s))
  ✓ oil;gas;geothermal   → oil;gas;geothermal.json  (1 centrale(s))
  ✓ unknown              → unknown.json  (11 centrale(s))
  ✓ coal;biomass;oil;gas → coal;biomass;oil;gas.json  (1 centrale(s))
  ✓ waste;gas            → waste;gas.json  (2 centrale(s))
  ✓ gas;biomass;oil      → gas;biomass;oil.json  (1 centrale(s))
  ✓ waste;biomass        → waste;biomass.json  (1 centrale(s))
  ✓ geothermal           → geothermal.json  (15 centrale(s))
  ✓ gas;oil              → gas;oil.json  (4 centrale(s))
  ✓ gas;biomass;waste    → gas;biomass;waste.json  (1 centrale(s))
  ✓ gas;oil;geothermal   → gas;oil;geothermal.json  (1 centrale(s))
  ✓ biomass;oil          → biomass;oil.json  (1 centrale(s))
  ✓ coal;biomass;oil     → coal;biomass;oil.json  (1 centrale(s))
  ✓ biofuel              → biofuel.json  (2 centrale(s))
  ✓ heat                 → heat.json  (1 centrale(s))
  ✓ biofuel;oil          → biofuel;oil.json  (1 centrale(s))
  ✓ electricity          → electricity.json  (1 centrale(s))
  ✓ biomass;gas;solar    → biomass;gas;solar.json  (1 centrale(s))

  ⚠  11 centrale(s) sans champ 'source' → classées dans unknown.json

Terminé : 36 fichier(s) créé(s) dans « enriched_per_filiere »

Process finished with exit code 0
"""

"""
split_by_source.py
------------------
Sépare un fichier JSON contenant une liste de centrales électriques
en plusieurs fichiers JSON, un par filière (champ `source`).

Usage :
    python split_by_source.py <input.json> [--output-dir <dossier>]

Exemple :
    python split_by_source.py centrales.json --output-dir output/
"""

import json
import argparse
from pathlib import Path
from collections import defaultdict


def split_by_source(input_path: str, output_dir: str = ".") -> None:
    input_file = Path(input_path)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Lecture du fichier source
    with open(input_file, encoding="utf-8") as f:
        plants = json.load(f)

    if not isinstance(plants, list):
        raise ValueError("Le fichier JSON doit contenir un tableau d'objets au niveau racine.")

    # Regroupement par filière
    by_source = defaultdict(list)
    unknown_count = 0

    for plant in plants:
        source = plant.get("source") or plant.get("plant:source")
        if not source:
            source = "unknown"
            unknown_count += 1
        by_source[source.strip().lower()].append(plant)

    # Écriture d'un fichier par filière
    for source, entries in by_source.items():
        out_file = output_path / f"{source}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
        print(f"  ✓ {source:20s} → {out_file}  ({len(entries)} centrale(s))")

    if unknown_count:
        print(f"\n  ⚠  {unknown_count} centrale(s) sans champ 'source' → classées dans unknown.json")

    print(f"\nTerminé : {len(by_source)} fichier(s) créé(s) dans « {output_path} »")


def main():
    parser = argparse.ArgumentParser(description="Sépare un JSON de centrales par filière.")
    parser.add_argument("--input",default="france_power_plants_enriched_3.json", help="Chemin vers le fichier JSON d'entrée")
    parser.add_argument(
        "--output-dir", "-o",
        default="enriched_per_filiere",
        help="Dossier de destination (créé si absent). Défaut : répertoire courant"
    )
    args = parser.parse_args()
    split_by_source(args.input, args.output_dir)


if __name__ == "__main__":
    main()