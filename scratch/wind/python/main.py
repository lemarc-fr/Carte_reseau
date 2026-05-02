from fetch import fetch_capabilities, fetch_describe_coverage, fetch_coverage
from analyse import get_latest_wind_components, get_nearest_time

API_KEY = "eyJ4NXQiOiJZV0kxTTJZNE1qWTNOemsyTkRZeU5XTTRPV014TXpjek1UVmhNbU14T1RSa09ETXlOVEE0Tnc9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJtYXJjYnJ1bmV0OTJAY2FyYm9uLnN1cGVyIiwiYXBwbGljYXRpb24iOnsib3duZXIiOiJtYXJjYnJ1bmV0OTIiLCJ0aWVyUXVvdGFUeXBlIjpudWxsLCJ0aWVyIjoiVW5saW1pdGVkIiwibmFtZSI6IkRlZmF1bHRBcHBsaWNhdGlvbiIsImlkIjo0MDI3OSwidXVpZCI6ImVhZTc3YmQwLTk4ZjctNDNlYy1iZmFkLWM0MzFmZWExODA0OCJ9LCJpc3MiOiJodHRwczpcL1wvcG9ydGFpbC1hcGkubWV0ZW9mcmFuY2UuZnI6NDQzXC9vYXV0aDJcL3Rva2VuIiwidGllckluZm8iOnsiNTBQZXJNaW4iOnsidGllclF1b3RhVHlwZSI6InJlcXVlc3RDb3VudCIsImdyYXBoUUxNYXhDb21wbGV4aXR5IjowLCJncmFwaFFMTWF4RGVwdGgiOjAsInN0b3BPblF1b3RhUmVhY2giOnRydWUsInNwaWtlQXJyZXN0TGltaXQiOjAsInNwaWtlQXJyZXN0VW5pdCI6InNlYyJ9fSwia2V5dHlwZSI6IlBST0RVQ1RJT04iLCJzdWJzY3JpYmVkQVBJcyI6W3sic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJBUk9NRSIsImNvbnRleHQiOiJcL3B1YmxpY1wvYXJvbWVcLzEuMCIsInB1Ymxpc2hlciI6ImFkbWluX21mIiwidmVyc2lvbiI6IjEuMCIsInN1YnNjcmlwdGlvblRpZXIiOiI1MFBlck1pbiJ9XSwiZXhwIjoxODcyMzIyMDE2LCJ0b2tlbl90eXBlIjoiYXBpS2V5IiwiaWF0IjoxNzc3NjQ5MjE2LCJqdGkiOiJkYzlkMTY2Ni00MGNiLTRkZWItYTgxNy04OGQ5YzFlNzA3NDcifQ==.RYxSy3h31aZEXdLwJTi9NRiaJzQo0MYBla0t6jyAg2DA21Mdp_b3E48lictpEU4SDPud2tuHZVWsyerR7FaBQMMsKMMF-Tb2FGL1zJqLS7f6ZwnhZQpQZM_9NsUdzjXuWwb8pCxb6vKn-p3gQlqsurj-s4eyr-5DQE4FoM7fJDtlEDMD91D848XTN4UTELlpfiGKqmyN7wSw5PeZ9pFBaD7iID2aFa6WdXu10nEidf9o2SaEBBgAG4Ux0qElKyZp5bYJd-oMBjzu_WUIQZVmq6pgvs9u4whqZtwmAekVu_Tj0MpXA_bzznwQ-grVcunUc79yVqeoWJgjClE2umIloA=="

BOUNDS = {
  "minLon": -8, "maxLon": 10,
  "minLat": 40, "maxLat": 52,
}
def fetch_u_v_tiff(api_key:str, bounds:dict):
    capabilities = fetch_capabilities(API_KEY)
    components = get_latest_wind_components(capabilities.text)
    print(f"Composantes U et V les plus récentes : {components['U']} et {components['V']}")

    if components["U"] is None or components["V"] is None:
        exit(1)

    describe_coverage_u = fetch_describe_coverage(API_KEY, components["U"])
    describe_coverage_v = fetch_describe_coverage(API_KEY, components["V"])

    if get_nearest_time(describe_coverage_u.text) != get_nearest_time(describe_coverage_v.text):
        print("Les composantes U et V ne sont pas à la même date")
        exit(1)

    coverage_time = get_nearest_time(describe_coverage_u.text)

    coverage_u = fetch_coverage(
        API_KEY,
        components["U"],
        [
            f"long({BOUNDS['minLon']},{BOUNDS['maxLon']})",
            f"lat({BOUNDS['minLat']},{BOUNDS['maxLat']})",
            "height(10)",
            f"time({coverage_time})",
        ],
    )
    if coverage_u.status_code != 200:
        print(coverage_u.text)

    coverage_v = fetch_coverage(
        API_KEY,
        components["V"],
        [
            f"long({BOUNDS['minLon']},{BOUNDS['maxLon']})",
            f"lat({BOUNDS['minLat']},{BOUNDS['maxLat']})",
            "height(10)",
            f"time({coverage_time})",
        ],
    )
    if coverage_v.status_code != 200:
        print(coverage_v.text)

    return coverage_u.content, coverage_v.content

a = fetch_u_v_tiff(API_KEY, BOUNDS)
print(f"Tailles des données U et V : {len(a[0])} et {len(a[1])} octets")
with open("scratch/wind/u.tiff", "wb") as f:
    f.write(a[0])
with open("scratch/wind/v.tiff", "wb") as f:
    f.write(a[1])