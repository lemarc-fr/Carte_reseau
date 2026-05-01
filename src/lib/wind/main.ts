import { fromArrayBuffer, TypedArray } from "geotiff";
import { WIND_MAX, WIND_MIN } from "@/config/mapConfig";
// Plage de vent en m/s — couvre largement les vents extrêmes


export type WindTextureResult = {
  image: ImageData;
  imageUnscale: [number, number];
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

  // Lire les rasters float32
  const [rasterU, rasterV] = await Promise.all([
    imageU.readRasters({ interleave: true }) as Promise<TypedArray>,
    imageV.readRasters({ interleave: true }) as Promise<TypedArray>,
  ]);

  // Encoder U → R, V → G, 0 → B, 255 → A
  // Même encodage que gdal_translate -scale WIND_MIN WIND_MAX 0 255
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const u = (rasterU[i] as number);
    const v = (rasterV[i] as number);

    rgba[i * 4 + 0] = scale(u, WIND_MIN, WIND_MAX); // R = U
    rgba[i * 4 + 1] = scale(v, WIND_MIN, WIND_MAX); // G = V
    rgba[i * 4 + 2] = 0;                             // B inutilisé
    rgba[i * 4 + 3] = 255;                           // A opaque
  }

  return {
    image: new ImageData(rgba, width, height),
    imageUnscale: [WIND_MIN, WIND_MAX],
  };
}

function scale(value: number, min: number, max: number): number {
  return Math.round(((value - min) / (max - min)) * 255);
}