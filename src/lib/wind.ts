import { BOUNDS, GRID_COLS, GRID_ROWS, UV_MAX } from "@/config/mapConfig";

function buildWindGrid() {
  const points: { lon: number; lat: number }[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const lon = BOUNDS.minLon + (c / (GRID_COLS - 1)) * (BOUNDS.maxLon - BOUNDS.minLon);
      const lat = BOUNDS.minLat + (r / (GRID_ROWS - 1)) * (BOUNDS.maxLat - BOUNDS.minLat);
      points.push({ lon, lat });
    }
  }
  return points;
}

const GRID_POINTS = buildWindGrid();

function dirSpeedToUV(dirDeg: number, speed: number) {
  const rad = ((dirDeg + 180) % 360) * (Math.PI / 180);
  return { u: speed * Math.sin(rad), v: speed * Math.cos(rad) };
}

// POST to avoid URL length / CORS issues with large GET queries
export async function fetchWindGrid(): Promise<{ u: number; v: number }[]> {
  const body = {
    latitude:  GRID_POINTS.map(p => parseFloat(p.lat.toFixed(3))),
    longitude: GRID_POINTS.map(p => parseFloat(p.lon.toFixed(3))),
    current: ['windspeed_10m', 'winddirection_10m'],
    wind_speed_unit: 'ms',
    forecast_days: 1,
  };

  const res = await fetch('https://api.open-meteo.com/v1/meteofrance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const arr = Array.isArray(json) ? json : [json];

  return arr.map((d: any) => {
    const speed: number = d.current?.windspeed_10m ?? 0;
    const dir: number   = d.current?.winddirection_10m ?? 0;
    return dirSpeedToUV(dir, speed);
  });
}


export function buildWindImageData(uvData: { u: number; v: number }[]): ImageData {
  const data = new Uint8ClampedArray(GRID_COLS * GRID_ROWS * 4);

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      // Flip vertically: weatherlayers-gl row 0 = north (maxLat)
      const srcIdx = (GRID_ROWS - 1 - r) * GRID_COLS + c;
      const dstIdx = (r * GRID_COLS + c) * 4;
      const { u, v } = uvData[srcIdx] ?? { u: 0, v: 0 };

      data[dstIdx + 0] = Math.round(((u / UV_MAX) * 0.5 + 0.5) * 255); // R = U
      data[dstIdx + 1] = Math.round(((v / UV_MAX) * 0.5 + 0.5) * 255); // G = V
      data[dstIdx + 2] = 0;
      data[dstIdx + 3] = 255;
    }
  }

  return new ImageData(data, GRID_COLS, GRID_ROWS);
}

