import { fromArrayBuffer, TypedArray } from "geotiff";

export type WindTextureResult = {
  image: ImageData;
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

  const [rasterU, rasterV] = await Promise.all([
    imageU.readRasters({ interleave: true }) as Promise<TypedArray>,
    imageV.readRasters({ interleave: true }) as Promise<TypedArray>,
  ]);

  // Calculer la vitesse max réelle pour calibrer la palette
  let maxSpeed = 0;
  for (let i = 0; i < width * height; i++) {
    const u = rasterU[i] as number;
    const v = rasterV[i] as number;
    const speed = Math.sqrt(u * u + v * v);
    if (speed > maxSpeed) maxSpeed = speed;
  }

  // Arrondir au multiple de 5 supérieur (ex: 23.4 → 25)
  const WIND_MAX = Math.ceil(maxSpeed / 5) * 5;
  const WIND_MIN = -WIND_MAX;

  console.log(`Vitesse max: ${maxSpeed.toFixed(1)} m/s → plage: [${WIND_MIN}, ${WIND_MAX}]`);

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const u = rasterU[i] as number;
    const v = rasterV[i] as number;
    rgba[i * 4 + 0] = scale(u, WIND_MIN, WIND_MAX);
    rgba[i * 4 + 1] = scale(v, WIND_MIN, WIND_MAX);
    rgba[i * 4 + 2] = 0;
    rgba[i * 4 + 3] = 255;
  }

  return {
    image: new ImageData(rgba, width, height),
    imageUnscale: [WIND_MIN, WIND_MAX],
    speedMax : WIND_MAX,
  };
}

function scale(value: number, min: number, max: number): number {
  return Math.round(((value - min) / (max - min)) * 255);
}