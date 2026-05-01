import httpx

API_KEY = "eyJ4NXQiOiJZV0kxTTJZNE1qWTNOemsyTkRZeU5XTTRPV014TXpjek1UVmhNbU14T1RSa09ETXlOVEE0Tnc9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJtYXJjYnJ1bmV0OTJAY2FyYm9uLnN1cGVyIiwiYXBwbGljYXRpb24iOnsib3duZXIiOiJtYXJjYnJ1bmV0OTIiLCJ0aWVyUXVvdGFUeXBlIjpudWxsLCJ0aWVyIjoiVW5saW1pdGVkIiwibmFtZSI6IkRlZmF1bHRBcHBsaWNhdGlvbiIsImlkIjo0MDI3OSwidXVpZCI6ImVhZTc3YmQwLTk4ZjctNDNlYy1iZmFkLWM0MzFmZWExODA0OCJ9LCJpc3MiOiJodHRwczpcL1wvcG9ydGFpbC1hcGkubWV0ZW9mcmFuY2UuZnI6NDQzXC9vYXV0aDJcL3Rva2VuIiwidGllckluZm8iOnsiNTBQZXJNaW4iOnsidGllclF1b3RhVHlwZSI6InJlcXVlc3RDb3VudCIsImdyYXBoUUxNYXhDb21wbGV4aXR5IjowLCJncmFwaFFMTWF4RGVwdGgiOjAsInN0b3BPblF1b3RhUmVhY2giOnRydWUsInNwaWtlQXJyZXN0TGltaXQiOjAsInNwaWtlQXJyZXN0VW5pdCI6InNlYyJ9fSwia2V5dHlwZSI6IlBST0RVQ1RJT04iLCJzdWJzY3JpYmVkQVBJcyI6W3sic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJBUk9NRSIsImNvbnRleHQiOiJcL3B1YmxpY1wvYXJvbWVcLzEuMCIsInB1Ymxpc2hlciI6ImFkbWluX21mIiwidmVyc2lvbiI6IjEuMCIsInN1YnNjcmlwdGlvblRpZXIiOiI1MFBlck1pbiJ9XSwiZXhwIjoxODcyMzIyMDE2LCJ0b2tlbl90eXBlIjoiYXBpS2V5IiwiaWF0IjoxNzc3NjQ5MjE2LCJqdGkiOiJkYzlkMTY2Ni00MGNiLTRkZWItYTgxNy04OGQ5YzFlNzA3NDcifQ==.RYxSy3h31aZEXdLwJTi9NRiaJzQo0MYBla0t6jyAg2DA21Mdp_b3E48lictpEU4SDPud2tuHZVWsyerR7FaBQMMsKMMF-Tb2FGL1zJqLS7f6ZwnhZQpQZM_9NsUdzjXuWwb8pCxb6vKn-p3gQlqsurj-s4eyr-5DQE4FoM7fJDtlEDMD91D848XTN4UTELlpfiGKqmyN7wSw5PeZ9pFBaD7iID2aFa6WdXu10nEidf9o2SaEBBgAG4Ux0qElKyZp5bYJd-oMBjzu_WUIQZVmq6pgvs9u4whqZtwmAekVu_Tj0MpXA_bzznwQ-grVcunUc79yVqeoWJgjClE2umIloA=="

with httpx.Client(http1=True, http2=False) as client:
    response = client.get(
        "https://public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS/GetCapabilities",
        params={"service": "WCS", "version": "2.0.1", "language": "eng"},
        headers={
            "accept": "*/*",
            "apikey": API_KEY,
        },
        timeout=30,
    )

with open("scratch/GetCapabilities.xml", "w") as f:
    f.write(str(response.status_code) + "\n" + response.text)

with httpx.Client(http1=True, http2=False) as client:
    response = client.get(
        "https://public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS/DescribeCoverage",
        params={"service": "WCS", "version": "2.0.1", "coverageID": "WIND_SPEED_GUST__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___2026-04-27T00.00.00Z"},
        headers={
            "accept": "*/*",
            "apikey": API_KEY,
        },
        timeout=30,
    )

with open("scratch/DescribeCoverage.xml", "w") as f:
    f.write(response.text)

with httpx.Client(http1=True, http2=False) as client:
    response = client.get(
        "https://public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS/GetCoverage",
        params={
            "service": "WCS",
            "version": "2.0.1",
            "coverageID": "WIND_SPEED_GUST__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___2026-04-27T00.00.00Z",
            "subset": [
                "long(2.0,3.0)",
                "lat(48.0,49.0)",
                "height(10)",
                "time(2026-04-27T01:00:00Z)"
            ],
            "format": "image/tiff",
            },
        headers={
            "accept": "*/*",
            "apikey": API_KEY,
        },
        timeout=30,
    )

with open("scratch/output.tiff", "wb") as f:
    f.write(response.content)