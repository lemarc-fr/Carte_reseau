import { fromArrayBuffer, TypedArray } from "geotiff";

export type WindTextureResult = {
  image: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  };
  imageUnscale: [number, number];
  speedMax: number;
};

export async function buildWindTexture(
  [uBuffer, vBuffer]: [ArrayBuffer, ArrayBuffer]
): Promise<WindTextureResult> {
  const [tiffU, tiffV] = await Promise.all([
    fromArrayBuffer(uBuffer),
    fromArrayBuffer(vBuffer),
  ]);

  const [imageU, imageV] = await Promise.all([
    tiffU.getImage(),
    tiffV.getImage(),
  ]);

  const width = imageU.getWidth();
  const height = imageU.getHeight();

  // Récupère la valeur NoData déclarée dans le GeoTIFF
  const nodataU = imageU.getGDALNoData();
  const nodataV = imageV.getGDALNoData();
  console.log(`NoData U: ${nodataU}, NoData V: ${nodataV}`);

  const [rasterU, rasterV] = await Promise.all([
    imageU.readRasters({ interleave: true }) as Promise<TypedArray>,
    imageV.readRasters({ interleave: true }) as Promise<TypedArray>,
  ]);

  // Seuil de validité physique (vent > 150 m/s = invalide)
  const PHYSICAL_MAX = 150;

  const isValid = (u: number, v: number): boolean => {
    if (!isFinite(u) || !isFinite(v)) return false;
    if (nodataU !== null && u === nodataU) return false;
    if (nodataV !== null && v === nodataV) return false;
    // Garde-fou physique en cas de NoData non déclaré
    if (Math.abs(u) > PHYSICAL_MAX || Math.abs(v) > PHYSICAL_MAX) return false;
    return true;
  };

  let maxSpeed = 0;
  for (let i = 0; i < width * height; i++) {
    const u = rasterU[i] as number;
    const v = rasterV[i] as number;
    if (!isValid(u, v)) continue;
    const speed = Math.sqrt(u * u + v * v);
    if (speed > maxSpeed) maxSpeed = speed;
  }

  const WIND_MAX = Math.ceil(maxSpeed / 5) * 5 || 50; // fallback si tout est NoData
  const WIND_MIN = -WIND_MAX;

  console.log(`Vitesse max: ${maxSpeed.toFixed(1)} m/s → plage: [${WIND_MIN}, ${WIND_MAX}]`);

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const u = rasterU[i] as number;
    const v = rasterV[i] as number;

    if (!isValid(u, v)) {
      // Pixel NoData → transparent / valeur neutre (vitesse = 0)
      rgba[i * 4 + 0] = scale(0, WIND_MIN, WIND_MAX);
      rgba[i * 4 + 1] = scale(0, WIND_MIN, WIND_MAX);
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 0; // alpha = 0 pour les distinguer visuellement
    } else {
      rgba[i * 4 + 0] = scale(u, WIND_MIN, WIND_MAX);
      rgba[i * 4 + 1] = scale(v, WIND_MIN, WIND_MAX);
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 255;
    }
  }

  return {
    image: { data: rgba, width, height },
    imageUnscale: [WIND_MIN, WIND_MAX],
    speedMax: WIND_MAX,
  };
}

function scale(value: number, min: number, max: number): number {
  return Math.round(((value - min) / (max - min)) * 255);
}