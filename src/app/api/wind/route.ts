import { NextResponse } from 'next/server';
import { fromArrayBuffer } from 'geotiff';
import { AROME_API_KEY, BOUNDS, GRID_COLS, GRID_ROWS } from '@/config/mapConfig';

const WCS_BASE =
  'https://public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS';

const U_PREFIX = 'U_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND';
const V_PREFIX = 'V_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND';

const CAPABILITIES_TTL_MS = 10 * 60 * 1000;
let cachedUCoverageId: string | null = null;
let cacheExpiresAt = 0;

async function getLatestUCoverageId(): Promise<string> {
  const now = Date.now();
  if (cachedUCoverageId && now < cacheExpiresAt) return cachedUCoverageId;

  const url = new URL(`${WCS_BASE}/GetCapabilities`);
  url.searchParams.set('service', 'WCS');
  url.searchParams.set('version', '2.0.1');
  url.searchParams.set('language', 'eng');

  const res = await fetch(url.toString(), {
    headers: { apikey: AROME_API_KEY },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`GetCapabilities failed: ${res.status}`);

  const text = await res.text();
  const regex = new RegExp(
    `(${U_PREFIX}___\\d{4}-\\d{2}-\\d{2}T\\d{2}\\.\\d{2}\\.\\d{2}Z)`,
    'g',
  );
  const ids = [...text.matchAll(regex)].map((m) => m[1]);
  if (!ids.length) throw new Error('No U wind coverage IDs found in GetCapabilities');

  ids.sort((a, b) => b.localeCompare(a));
  cachedUCoverageId = ids[0];
  cacheExpiresAt = Date.now() + CAPABILITIES_TTL_MS;
  return cachedUCoverageId;
}

function parseCoverageRunTime(coverageId: string): Date {
  const match = coverageId.match(/___(\d{4}-\d{2}-\d{2}T\d{2})\.(\d{2})\.(\d{2})Z$/);
  if (!match) throw new Error(`Cannot parse run time from coverage ID: ${coverageId}`);
  return new Date(`${match[1]}:${match[2]}:${match[3]}Z`);
}

async function fetchCoverageGeoTiff(
  coverageId: string,
  forecastTime: string,
): Promise<ArrayBuffer> {
  const url = new URL(`${WCS_BASE}/GetCoverage`);
  url.searchParams.set('service', 'WCS');
  url.searchParams.set('version', '2.0.1');
  url.searchParams.set('coverageID', coverageId);
  url.searchParams.append('subset', `long(${BOUNDS.minLon},${BOUNDS.maxLon})`);
  url.searchParams.append('subset', `lat(${BOUNDS.minLat},${BOUNDS.maxLat})`);
  url.searchParams.append('subset', 'height(10)');
  url.searchParams.append('subset', `time(${forecastTime})`);
  url.searchParams.set('format', 'image/tiff');

  const res = await fetch(url.toString(), {
    headers: { apikey: AROME_API_KEY },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GetCoverage failed (${res.status}) for ${coverageId}: ${body.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

async function geotiffToGrid(buffer: ArrayBuffer, cols: number, rows: number): Promise<number[]> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  const band = rasters[0] as Float32Array | Int16Array | Uint8Array;
  const srcW = image.getWidth();
  const srcH = image.getHeight();

  const out = new Array<number>(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = Math.round((col / (cols - 1)) * (srcW - 1));
      const sy = Math.round((row / (rows - 1)) * (srcH - 1));
      out[row * cols + col] = band[sy * srcW + sx];
    }
  }
  return out;
}

export async function GET() {
  try {
    const uId = await getLatestUCoverageId();
    const vId = uId.replace(U_PREFIX, V_PREFIX);

    const runDate = parseCoverageRunTime(uId);
    const forecastDate = new Date(runDate.getTime() + 3600 * 1000);
    const forecastTime = forecastDate.toISOString().replace(/\.\d{3}Z$/, 'Z');

    const [uBuf, vBuf] = await Promise.all([
      fetchCoverageGeoTiff(uId, forecastTime),
      fetchCoverageGeoTiff(vId, forecastTime),
    ]);

    const [uGrid, vGrid] = await Promise.all([
      geotiffToGrid(uBuf, GRID_COLS, GRID_ROWS),
      geotiffToGrid(vBuf, GRID_COLS, GRID_ROWS),
    ]);

    const grid = uGrid.map((u, i) => ({ u, v: vGrid[i] }));
    return NextResponse.json({ grid });
  } catch (err) {
    console.error('[wind/route]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
