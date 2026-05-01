import { GRID_COLS, GRID_ROWS, UV_MAX } from "@/config/mapConfig";

export async function fetchWindGrid(): Promise<{ u: number; v: number }[]> {
  const res = await fetch('/api/wind');
  if (!res.ok) throw new Error(`Wind API returned ${res.status} ${res.statusText}`);
  const { grid } = await res.json();
  return grid as { u: number; v: number }[];
}

export function buildWindImageData(uvData: { u: number; v: number }[]): ImageData {
  const imageData = new ImageData(GRID_COLS, GRID_ROWS);
  for (let i = 0; i < uvData.length; i++) {
    const { u, v } = uvData[i];
    const r = Math.max(0, Math.min(255, Math.round(((u + UV_MAX) / (2 * UV_MAX)) * 255)));
    const g = Math.max(0, Math.min(255, Math.round(((v + UV_MAX) / (2 * UV_MAX)) * 255)));
    imageData.data[i * 4 + 0] = r;
    imageData.data[i * 4 + 1] = g;
    imageData.data[i * 4 + 2] = 0;
    imageData.data[i * 4 + 3] = 255;
  }
  return imageData;
}
