import { fetchCapabilities, fetchDescribeCoverage, fetchCoverage } from "./fetch";
import { getLatestWindComponents, getNearestTime } from "./analyse";

export async function fetchUVTiff(
  apiKey: string,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
): Promise<[ArrayBuffer, ArrayBuffer]> {
  const capabilities = await fetchCapabilities(apiKey);
  const components = getLatestWindComponents(capabilities.data as string);

  if (!components.U || !components.V) {
    throw new Error("Composantes U ou V introuvables dans les capabilities");
  }

  const [describeCoverageU, describeCoverageV] = await Promise.all([
    fetchDescribeCoverage(apiKey, components.U),
    fetchDescribeCoverage(apiKey, components.V),
  ]);

  const timeU = getNearestTime(describeCoverageU.data as string);
  const timeV = getNearestTime(describeCoverageV.data as string);

  if (timeU !== timeV) {
    throw new Error("Les composantes U et V ne sont pas à la même date");
  }

  const coverageTime = timeU;

  const subsets = (b: { minLon: number; maxLon: number; minLat: number; maxLat: number }) => [
    `long(${b.minLon},${b.maxLon})`,
    `lat(${b.minLat},${b.maxLat})`,
    "height(10)",
    `time(${coverageTime})`,
  ];

  const [coverageU, coverageV] = await Promise.all([
    fetchCoverage(apiKey, components.U, subsets(bounds)),
    fetchCoverage(apiKey, components.V, subsets(bounds)),
  ]);

  if (coverageU.status !== 200) {
    throw new Error(`Erreur coverage U (${coverageU.status}): ${coverageU.data}`);
  }
  if (coverageV.status !== 200) {
    throw new Error(`Erreur coverage V (${coverageV.status}): ${coverageV.data}`);
  }
  const toArrayBuffer = (buf: Buffer | ArrayBuffer): ArrayBuffer => {
    if (buf instanceof ArrayBuffer) return buf;
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    return ab;
  };
  return [
    toArrayBuffer(coverageU.data as Buffer),
    toArrayBuffer(coverageV.data as Buffer),
  ];
}