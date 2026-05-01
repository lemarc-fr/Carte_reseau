import axios, { type AxiosResponse } from "axios";

const BASE_URL =
  "https://public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS";

export async function fetchCapabilities(apiKey: string) {
  return axios.get(`${BASE_URL}/GetCapabilities`, {
    params: { service: "WCS", version: "2.0.1", language: "eng" },
    headers: { accept: "*/*", apikey: apiKey },
    timeout: 30000,
  });
}

export async function fetchDescribeCoverage(apiKey: string, coverageId: string) {
  return axios.get(`${BASE_URL}/DescribeCoverage`, {
    params: { service: "WCS", version: "2.0.1", coverageID: coverageId },
    headers: { accept: "*/*", apikey: apiKey },
    timeout: 30000,
  });
}

export async function fetchCoverage(
  apiKey: string,
  coverageId: string,
  subset: string[]
): Promise<AxiosResponse> {
  // Construire l'URL manuellement pour éviter subset[]=...
  const params = new URLSearchParams({
    service: "WCS",
    version: "2.0.1",
    coverageID: coverageId,
    format: "image/tiff",
  });

  // Ajouter chaque subset séparément → &subset=...&subset=...
  for (const s of subset) {
    params.append("subset", s);
  }

  const url = `${BASE_URL}/GetCoverage?${params.toString()}`;

  return axios.get(url, {
    headers: { accept: "*/*", apikey: apiKey },
    timeout: 30000,
    responseType: "arraybuffer",
  });
}