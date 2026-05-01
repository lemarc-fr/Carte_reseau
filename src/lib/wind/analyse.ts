import { XMLParser } from "fast-xml-parser";

interface WindComponents {
  U: string | null;
  V: string | null;
}

export function getLatestWindComponents(xmlText: string): WindComponents {
  if (!xmlText) return { U: null, V: null };

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  let root: any;
  try {
    root = parser.parse(xmlText);
  } catch {
    return { U: null, V: null };
  }

  // Naviguer jusqu'aux CoverageSummary (structure wcs:Capabilities > wcs:Contents > wcs:CoverageSummary)
  const contents =
    root?.["wcs:Capabilities"]?.["wcs:Contents"] ??
    root?.["Capabilities"]?.["Contents"] ??
    root?.["wcs:CoverageDescriptions"] ??
    {};

  const rawSummaries =
    contents?.["wcs:CoverageSummary"] ??
    contents?.["CoverageSummary"] ??
    [];

  const summaries: any[] = Array.isArray(rawSummaries) ? rawSummaries : [rawSummaries];

  let uLatest: [Date | null, string | null] = [null, null];
  let vLatest: [Date | null, string | null] = [null, null];

  for (const cs of summaries) {
    if (!cs) continue;

    const covId: string = (
      cs?.["wcs:CoverageId"] ??
      cs?.["CoverageId"] ??
      ""
    ).trim();

    if (!covId) continue;

    const parts = covId.split("___");
    if (!parts.length) continue;

    const dateStr = parts[parts.length - 1];
    const dt = parseCoverageDate(dateStr);
    if (!dt) continue;

    if (covId.startsWith("U_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___")) {
      if (!uLatest[0] || dt > uLatest[0]) uLatest = [dt, covId];
    } else if (covId.startsWith("V_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___")) {
      if (!vLatest[0] || dt > vLatest[0]) vLatest = [dt, covId];
    }
  }

  return { U: uLatest[1], V: vLatest[1] };
}

function parseCoverageDate(dateStr: string): Date | null {
  // Format: 2024-01-15T12.00.00Z  (points au lieu de ":" pour HH.MM.SS)
  const normalized = dateStr.replace(
    /(\d{4}-\d{2}-\d{2}T)(\d{2})\.(\d{2})\.(\d{2})Z/,
    "$1$2:$3:$4Z"
  );
  const dt = new Date(normalized);
  return isNaN(dt.getTime()) ? null : dt;
}

// ---------------------------------------------------------------------------

export function getNearestTime(xmlText: string): string {
  if (!xmlText) throw new Error("xmlText vide");

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  let root: any;
  try {
    root = parser.parse(xmlText);
  } catch (e) {
    throw new Error(`XML invalide: ${e}`);
  }

  const rawBegin = findDeep(root, "gml:beginPosition") ?? findDeep(root, "beginPosition");
  if (!rawBegin) throw new Error("beginPosition manquant");

  // Gérer le cas où fast-xml-parser retourne un objet avec attributs
  const beginText = typeof rawBegin === "object"
    ? (rawBegin as any)["#text"]
    : rawBegin;

  if (!beginText) throw new Error("beginPosition manquant");

  const baseTime = new Date(beginText.replace("Z", "+00:00") ?? beginText);
  if (isNaN(baseTime.getTime())) throw new Error(`beginPosition invalide: ${beginText}`);

  // Coefficients de l'axe time
  const axes =
    findAllDeep(root, "gmlrgrid:GeneralGridAxis") ??
    findAllDeep(root, "GeneralGridAxis") ??
    [];

  let coeffs: number[] | null = null;

  for (const axis of axes) {
    const axisName: string = (
      axis?.["gmlrgrid:gridAxesSpanned"] ??
      axis?.["gridAxesSpanned"] ??
      ""
    ).trim();

    if (axisName !== "time") continue;

    const coeffsText: string = (
      axis?.["gmlrgrid:coefficients"] ??
      axis?.["coefficients"] ??
      ""
    ).trim();

    if (!coeffsText) continue;

    try {
      coeffs = coeffsText.split(/\s+/).filter(Boolean).map(Number);
      if (coeffs.some(isNaN)) throw new Error();
    } catch {
      throw new Error("coefficients time invalides");
    }
    break;
  }

  if (!coeffs || coeffs.length === 0) throw new Error("aucun coefficient temporel trouvé");

  const now = Date.now();

  const computeDt = (sec: number): Date => new Date(baseTime.getTime() + sec * 1000);

  const best = coeffs.reduce((a, b) =>
    Math.abs(computeDt(a).getTime() - now) <= Math.abs(computeDt(b).getTime() - now) ? a : b
  );

  return formatWCS(computeDt(best));
}

function formatWCS(dt: Date): string {
  return dt.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Helpers pour traverser un objet JSON parsé à la recherche d'une clé
function findDeep(obj: any, key: string): any {
  if (!obj || typeof obj !== "object") return null;
  if (key in obj) return obj[key]; // plus de String() cast
  for (const v of Object.values(obj)) {
    const found = findDeep(v, key);
    if (found !== null) return found;
  }
  return null;
}

function findAllDeep(obj: any, key: string): any[] {
  const results: any[] = [];
  if (!obj || typeof obj !== "object") return results;
  if (key in obj) {
    const val = obj[key];
    results.push(...(Array.isArray(val) ? val : [val]));
  }
  for (const v of Object.values(obj)) {
    results.push(...findAllDeep(v, key));
  }
  return results;
}