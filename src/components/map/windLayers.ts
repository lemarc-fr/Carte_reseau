import { ClipExtension } from '@deck.gl/extensions';
import { ParticleLayer, RasterLayer } from 'weatherlayers-gl';
import { PARTICLE_COLOR, WIND_PALETTE, WIND_RASTER_OPACITY } from '@/config/mapConfig';
import type { WindLayerData } from '@/store/useMapStore';

// Le shader WeatherLayers sort une couleur prémultipliée par l'alpha : sans ces
// facteurs, deck.gl la multiplie une seconde fois et le fond devient gris.
const PREMULTIPLIED_ALPHA_BLENDING = {
  blend: true,
  blendColorSrcFactor: 'one',
  blendColorDstFactor: 'one-minus-src-alpha',
  blendAlphaSrcFactor: 'one',
  blendAlphaDstFactor: 'one-minus-src-alpha',
} as const;

// Particules par degré carré : densité à peu près égale sur l'Europe et sur la France
const PARTICLES_PER_SQUARE_DEGREE = 3;
const MAX_PARTICLES = 6000;

/**
 * Fond coloré et particules de chaque couche (Europe d'abord, la France HD par-dessus).
 * `particles: false` : image fixe (page de test /test/wind).
 */
export function windDeckLayers(layers: WindLayerData[], beforeId: string, { particles = true } = {}) {
  return layers.flatMap((layer) => {
    const { minLon, minLat, maxLon, maxLat } = layer.bounds;
    const bounds: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];
    const area = (maxLon - minLon) * (maxLat - minLat);
    return [
      new RasterLayer({
        id: `wind-raster-${layer.id}`,
        beforeId,
        image: layer.image,
        imageUnscale: layer.imageUnscale, // R/G = u/v encodés sur [-max, +max]
        bounds,
        palette: WIND_PALETTE,
        opacity: WIND_RASTER_OPACITY,
        parameters: PREMULTIPLIED_ALPHA_BLENDING,
        extensions: [new ClipExtension()],
        clipBounds: bounds,
      }),
      particles &&
      new ParticleLayer({
        id: `wind-particles-${layer.id}`,
        beforeId,
        image: layer.image,
        imageUnscale: layer.imageUnscale,
        bounds,
        numParticles: Math.min(MAX_PARTICLES, Math.round(area * PARTICLES_PER_SQUARE_DEGREE)),
        speedFactor: 3.0,
        width: 1,
        opacity: 0.85,
        maxAge: 100,
        animate: true,
        color: PARTICLE_COLOR,
        extensions: [new ClipExtension()],
        clipBounds: bounds,
      }),
    ].filter((l) => l !== false);
  });
}
