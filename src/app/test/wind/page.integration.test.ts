import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Capture de /test/wind dans Chromium (npm run test:integration). L'application doit
// tourner : TEST_BASE_URL (défaut http://localhost:3000). Image : test-output/wind.png.

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const OUTPUT = join(process.cwd(), 'test-output', 'wind.png');

/** Chromium : CHROMIUM_PATH, celui de playwright-core, sinon le plus récent du cache Playwright. */
function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), '.cache', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const dir of dirs) {
    for (const sub of ['chrome-linux-arm64', 'chrome-linux64', 'chrome-linux']) {
      const path = join(cache, dir, sub, 'chrome');
      if (existsSync(path)) return path;
    }
  }
  return undefined;
}

type WindTestState = {
  ready: boolean;
  layers: { id: string; model: string; validTime: number }[];
  box?: [number, number, number, number];
  error?: string;
};

describe('page /test/wind', () => {
  let browser: Browser;
  let state: WindTestState;
  let png: Buffer;
  let reference: Buffer;

  /** Ouvre la page et attend la carte dessinée ; renvoie la capture et l'état exposé par la page. */
  async function capture(query: string, path?: string): Promise<{ png: Buffer; state: WindTestState }> {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`${BASE_URL}/test/wind${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__windTest?.ready || window.__windTest?.error, undefined, {
      timeout: 180_000,
      polling: 1000,
    });
    const result = (await page.evaluate(() => window.__windTest)) as WindTestState;
    expect(errors).toEqual([]);
    const image = await page.screenshot({ path, timeout: 180_000 });
    await page.close();
    return { png: image, state: result };
  }

  beforeAll(async () => {
    browser = await chromium.launch({
      executablePath: chromiumPath(),
      // Pas de GPU sur le serveur : rendu WebGL logiciel
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    mkdirSync(join(process.cwd(), 'test-output'), { recursive: true });
    ({ png, state } = await capture('', OUTPUT));
    ({ png: reference } = await capture('?vent=0'));
  });

  afterAll(() => browser?.close());

  it('charge les deux couches à la même échéance', () => {
    expect(state.error).toBeUndefined();
    expect(state.layers.map((l) => l.id)).toEqual(['europe', 'france']);
    expect(state.layers[0].model).toMatch(/ARPEGE|GFS/);
    expect(state.layers[1].model).toMatch(/AROME/);
    expect(state.layers[0].validTime).toBe(state.layers[1].validTime);
  });

  it('colore toute l’emprise du vent, sans bande vide', async () => {
    const raw = async (image: Buffer) => (await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
    const [withWind, without] = await Promise.all([raw(png), raw(reference)]);
    const { width, height } = withWind.info;
    expect([width, height]).toEqual([1200, 800]);
    // Dans l'emprise du vent (hors bandeau en bas à gauche), chaque pixel doit différer
    // de la carte sans vent : un pixel inchangé est un trou dans les couches
    const [x0, y0, x1, y1] = state.box!;
    let inside = 0;
    let unchanged = 0;
    for (let y = Math.max(0, y0 + 2); y < Math.min(height, y1 - 2); y++) {
      for (let x = Math.max(0, x0 + 2); x < Math.min(width, x1 - 2); x++) {
        if (x < 480 && y > height - 60) continue;
        const i = (y * width + x) * 3;
        const diff =
          Math.abs(withWind.data[i] - without.data[i]) +
          Math.abs(withWind.data[i + 1] - without.data[i + 1]) +
          Math.abs(withWind.data[i + 2] - without.data[i + 2]);
        inside++;
        if (diff <= 3) unchanged++;
      }
    }
    expect(inside).toBeGreaterThan(100_000);
    expect(unchanged / inside).toBeLessThan(0.01);
  });
});
