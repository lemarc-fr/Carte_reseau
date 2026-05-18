import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

session = requests.Session()
session.headers.update({
    "User-Agent": "france-power-plants-enricher/1.0 (test)"
})

def overpass_query(query):
    response = session.post(
        OVERPASS_URL,
        data={"data": query},
        timeout=60
    )
    response.raise_for_status()
    return response.json()

def test_node(node_id):
    """Cas simple : un node → ses tags + coordonnées"""
    print(f"\n=== NODE {node_id} ===")
    data = overpass_query(f"""
    [out:json][timeout:30];
    node({node_id});
    out geom;
    """)
    for el in data["elements"]:
        print(f"  lat={el.get('lat')}, lon={el.get('lon')}")
        print(f"  tags={el.get('tags', {})}")

def test_way(way_id):
    """Way → tags + tous ses nodes avec coordonnées"""
    print(f"\n=== WAY {way_id} ===")
    data = overpass_query(f"""
    [out:json][timeout:30];
    way({way_id});
    >>;
    out geom;
    """)
    nodes = [el for el in data["elements"] if el["type"] == "node"]
    ways  = [el for el in data["elements"] if el["type"] == "way"]
    print(f"  way tags={ways[0].get('tags', {}) if ways else 'N/A'}")
    print(f"  {len(nodes)} nodes:")
    for n in nodes[:5]:  # premiers seulement
        print(f"    id={n['id']} lat={n['lat']} lon={n['lon']}")
    if len(nodes) > 5:
        print(f"    ... ({len(nodes) - 5} autres)")

def test_relation_nodes(relation_id):
    """Relation avec membres = nodes directs (ex: parc éolien Richebourg)"""
    print(f"\n=== RELATION (nodes) {relation_id} ===")
    data = overpass_query(f"""
    [out:json][timeout:30];
    relation({relation_id});
    >>;
    out geom;
    """)
    elements = data["elements"]
    root = next((el for el in elements if el["type"] == "relation"), None)
    nodes = [el for el in elements if el["type"] == "node"]
    print(f"  tags={root.get('tags', {}) if root else 'N/A'}")
    print(f"  {len(nodes)} nodes:")
    for n in nodes[:5]:
        print(f"    id={n['id']} lat={n['lat']} lon={n['lon']} tags={n.get('tags', {})}")
    if len(nodes) > 5:
        print(f"    ... ({len(nodes) - 5} autres)")

def test_relation_ways(relation_id):
    """Relation avec membres = ways (ex: centrale à ways)"""
    print(f"\n=== RELATION (ways) {relation_id} ===")
    data = overpass_query(f"""
    [out:json][timeout:30];
    relation({relation_id});
    >>;
    out geom;
    """)
    elements = data["elements"]
    root  = next((el for el in elements if el["type"] == "relation"), None)
    ways  = [el for el in elements if el["type"] == "way"]
    nodes = [el for el in elements if el["type"] == "node"]
    print(f"  tags={root.get('tags', {}) if root else 'N/A'}")
    print(f"  {len(ways)} ways, {len(nodes)} nodes au total")
    for w in ways[:3]:
        print(f"    way id={w['id']} tags={w.get('tags', {})}")
    print(f"  premiers nodes:")
    for n in nodes[:5]:
        print(f"    id={n['id']} lat={n['lat']} lon={n['lon']}")

if __name__ == "__main__":
    # Node individuel
    test_node(9598569465)

    # Way individuel (un des ways de la relation 15096110)
    test_way(1128036296)

    # Relation dont les membres sont des nodes (Richebourg)
    test_relation_nodes(13953402)

    # Relation dont les membres sont des ways
    test_relation_ways(15096110)

    print("\n=== OK ===")