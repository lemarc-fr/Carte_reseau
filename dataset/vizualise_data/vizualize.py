import json
import math
from pathlib import Path

try:
    import folium
    from folium.plugins import MeasureControl
except ImportError:
    print("Installation de folium...")
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "folium"])
    import folium
    from folium.plugins import MeasureControl

try:
    from shapely.geometry import Polygon
except ImportError:
    print("Installation de shapely...")
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "shapely"])
    from shapely.geometry import Polygon

# ─── Chargement du JSON ───────────────────────────────────────────────────────

JSON_FILE = "exemple_centrale_enriched.json"

with open(JSON_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

name      = data["name"]
eng_name  = data["english_name"]
operator  = data["operator"]
output_mw = data["output"]
source    = data["source"]
start     = data["detail_page_data"]["osm_details"]["tags"]["start_date"]
commission= data["wikidata_details"]["commissioning_date"]
wiki_lat  = data["wikidata_details"]["latitude"]
wiki_lon  = data["wikidata_details"]["longitude"]

# ─── Extraction des coordonnées du polygone ────────────────────────────────────

# On assemble les géométries des deux ways "outer" de la relation
all_coords = []  # liste de (lat, lon)

relation = data["detail_page_data"]["osm_details"]["relations"][0]
for member in relation["members"]:
    for pt in member["geometry"]:
        all_coords.append((pt["lat"], pt["lon"]))

# Déduplication en conservant l'ordre (le polygone est fermé dans les données)
seen = set()
polygon_coords = []
for c in all_coords:
    if c not in seen:
        seen.add(c)
        polygon_coords.append(c)

# ─── Calcul du centroïde via Shapely ──────────────────────────────────────────

shapely_poly = Polygon([(lon, lat) for lat, lon in polygon_coords])
centroid = shapely_poly.centroid
centroid_lat = centroid.y
centroid_lon = centroid.x
area_m2 = shapely_poly.area * (111_320 ** 2)   # approximation en m²
area_ha = area_m2 / 10_000

# Bounding box
lats = [c[0] for c in polygon_coords]
lons = [c[1] for c in polygon_coords]
bbox = {
    "lat_min": min(lats), "lat_max": max(lats),
    "lon_min": min(lons), "lon_max": max(lons),
}
width_km  = (bbox["lon_max"] - bbox["lon_min"]) * 111.320 * math.cos(math.radians(centroid_lat))
height_km = (bbox["lat_max"] - bbox["lat_min"]) * 111.320

print(f"✅  Polygone : {len(polygon_coords)} points")
print(f"📍  Centroïde calculé  : {centroid_lat:.6f}, {centroid_lon:.6f}")
print(f"📍  Centroïde Wikidata : {wiki_lat:.6f}, {wiki_lon:.6f}")
print(f"📐  Surface approx.    : {area_ha:.1f} ha")
print(f"↔️   Largeur approx.    : {width_km:.2f} km")
print(f"↕️   Hauteur approx.    : {height_km:.2f} km")

# ─── Création de la carte Folium ──────────────────────────────────────────────

m = folium.Map(
    location=[centroid_lat, centroid_lon],
    zoom_start=14,
    tiles=None,
)

# Couches de fond
folium.TileLayer("OpenStreetMap",  name="🗺️ OpenStreetMap").add_to(m)
folium.TileLayer(
    tiles="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr="Esri",
    name="🛰️ Satellite (Esri)",
).add_to(m)
folium.TileLayer(
    tiles="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attr="Google",
    name="🌍 Satellite (Google)",
).add_to(m)

# ─── Polygone du site ─────────────────────────────────────────────────────────

folium.Polygon(
    locations=polygon_coords,
    color="#FF4500",
    weight=2.5,
    fill=True,
    fill_color="#FF6347",
    fill_opacity=0.25,
    tooltip=f"<b>{name}</b><br>Périmètre clôturé",
    popup=folium.Popup(
        f"""
        <div style="font-family:sans-serif;width:260px">
          <h4 style="margin:0 0 6px;color:#c0392b">⚛️ {eng_name}</h4>
          <b>{name}</b><br><br>
          <table style="width:100%;font-size:13px">
            <tr><td>🏭 Opérateur</td><td><b>{operator}</b></td></tr>
            <tr><td>⚡ Puissance</td><td><b>{output_mw}</b></td></tr>
            <tr><td>☢️ Source</td><td><b>Nucléaire (fission)</b></td></tr>
            <tr><td>📅 Début construction</td><td><b>{start}</b></td></tr>
            <tr><td>✅ Mise en service</td><td><b>{commission}</b></td></tr>
            <tr><td>📐 Surface approx.</td><td><b>{area_ha:.0f} ha</b></td></tr>
          </table>
        </div>
        """,
        max_width=280,
    ),
).add_to(m)

# ─── Centroïde calculé ────────────────────────────────────────────────────────

folium.Marker(
    location=[centroid_lat, centroid_lon],
    icon=folium.Icon(color="red", icon="plus-sign", prefix="glyphicon"),
    tooltip="Centroïde calculé (Shapely)",
    popup=folium.Popup(
        f"""
        <div style="font-family:sans-serif;font-size:13px">
          <b>Centroïde calculé</b><br>
          Lat : {centroid_lat:.6f}<br>
          Lon : {centroid_lon:.6f}<br>
          <i>Calculé sur le polygone OSM</i>
        </div>
        """,
        max_width=220,
    ),
).add_to(m)

# ─── Point Wikidata ───────────────────────────────────────────────────────────

folium.Marker(
    location=[wiki_lat, wiki_lon],
    icon=folium.Icon(color="blue", icon="info-sign", prefix="glyphicon"),
    tooltip="Point de référence Wikidata",
    popup=folium.Popup(
        f"""
        <div style="font-family:sans-serif;font-size:13px">
          <b>Référence Wikidata</b><br>
          Lat : {wiki_lat:.6f}<br>
          Lon : {wiki_lon:.6f}<br>
          <a href="https://www.wikidata.org/wiki/{data['wikidata_id']}" target="_blank">
            Voir sur Wikidata ↗
          </a>
        </div>
        """,
        max_width=220,
    ),
).add_to(m)

# ─── Contrôles ────────────────────────────────────────────────────────────────

folium.LayerControl(position="topright", collapsed=False).add_to(m)
MeasureControl(position="bottomleft", primary_length_unit="kilometers").add_to(m)

# Légende
legend_html = f"""
<div style="
  position: fixed; bottom: 30px; right: 15px; z-index: 9999;
  background: white; border: 1px solid #ccc; border-radius: 8px;
  padding: 12px 16px; font-family: sans-serif; font-size: 13px;
  box-shadow: 2px 2px 6px rgba(0,0,0,.2); min-width: 210px;
">
  <b style="font-size:14px">⚛️ {eng_name}</b><br>
  <hr style="margin:6px 0">
  <span style="color:#FF4500">■</span> Périmètre du site<br>
  <span style="color:#2980b9">- -</span> Bounding box<br>
  <span style="color:#e74c3c">✚</span> Centroïde calculé<br>
  <span style="color:#2980b9">ℹ</span> Référence Wikidata<br>
  <span style="color:#8e44ad">○</span> Rayon 1 km<br>
  <hr style="margin:6px 0">
  <small>Surface : ~{area_ha:.0f} ha &nbsp;|&nbsp; {output_mw}</small>
</div>
"""
m.get_root().html.add_child(folium.Element(legend_html))

# ─── Sauvegarde ───────────────────────────────────────────────────────────────

output_path = Path("carte_gravelines.html")
m.save(str(output_path))
print(f"\n✅  Carte générée : {output_path.resolve()}")
print("   Ouvrez ce fichier dans un navigateur.")

# Ouvrir automatiquement dans le navigateur (optionnel)
# webbrowser.open(output_path.resolve().as_uri())
