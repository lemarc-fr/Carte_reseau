import json
import requests
from bs4 import BeautifulSoup

URL = "https://openinframap.org/stats/area/France/plants"

headers = {
    "User-Agent": "Mozilla/5.0"
}

response = requests.get(URL, headers=headers)
response.raise_for_status()

soup = BeautifulSoup(response.text, "html.parser")

table = soup.find("table", class_="plants-table")

if table is None:
    raise Exception("Tableau introuvable")

plants = []

tbody = table.find("tbody")

for row in tbody.find_all("tr"):
    cols = row.find_all("td")

    if len(cols) < 7:
        continue

    name_tag = cols[0].find("a")
    name = name_tag.get_text(strip=True) if name_tag else None
    detail_url = name_tag["href"] if name_tag else None

    english_name_tag = cols[1]
    english_name = english_name_tag.get_text(strip=True)

    operator = cols[2].get_text(strip=True)

    output = cols[3].get_text(" ", strip=True)

    source = cols[4].get_text(strip=True)

    method = cols[5].get_text(strip=True)

    wikidata_tag = cols[6].find("a")
    wikidata_id = (
        wikidata_tag.get_text(strip=True)
        if wikidata_tag
        else None
    )

    wikidata_url = (
        wikidata_tag["href"]
        if wikidata_tag
        else None
    )

    plants.append({
        "name": name,
        "detail_url": detail_url,
        "english_name": english_name,
        "operator": operator,
        "output": output,
        "source": source,
        "method": method,
        "wikidata_id": wikidata_id,
        "wikidata_url": wikidata_url
    })

with open("france_power_plants.json", "w", encoding="utf-8") as f:
    json.dump(plants, f, ensure_ascii=False, indent=2)

print(f"{len(plants)} centrales enregistrées dans france_power_plants.json")
