import httpx

def fetch_capabilities(api_key: str) -> httpx.Response:
    with httpx.Client(http1=True, http2=False) as client:
        response = client.get(
            "https://public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS/GetCapabilities",
            params={"service": "WCS", "version": "2.0.1", "language": "eng"},
            headers={
                "accept": "*/*",
                "apikey": api_key,
            },
            timeout=30,
        )
    return response

def fetch_describe_coverage(api_key: str, coverage_id: str) -> httpx.Response:
    with httpx.Client(http1=True, http2=False) as client:
        response = client.get(
            "https://public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS/DescribeCoverage",
            params={"service": "WCS", "version": "2.0.1", "coverageID": coverage_id},
            headers={
            "accept": "*/*",
            "apikey": api_key,
        },
        timeout=30,
    )
    return response

def fetch_coverage(api_key: str, coverage_id: str, subset: list[str]) -> httpx.Response:
    with httpx.Client(http1=True, http2=False) as client:
        response = client.get(
            "https://public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS/GetCoverage",
            params={
                "service": "WCS",
                "version": "2.0.1",
                "coverageID": coverage_id,
                "subset": subset,
                "format": "image/tiff",
                },
            headers={
                "accept": "*/*",
                "apikey": api_key,
            },
            timeout=30,
        )
    return response