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

const boundsOf = (layer: WindLayerData): [number, number, number, number] => {
  const { minLon, minLat, maxLon, maxLat } = layer.bounds;
  return [minLon, minLat, maxLon, maxLat];
};

/** Fond coloré de chaque couche (Europe d'abord, la France HD par-dessus), sous les lignes électriques. */
export function windRasterLayers(layers: WindLayerData[], beforeId: string) {
  return layers.map(
    (layer) =>
      new RasterLayer({
        id: `wind-raster-${layer.id}`,
        beforeId,
        image: layer.image,
        imageUnscale: layer.imageUnscale, // R/G = u/v encodés sur [-max, +max]
        bounds: boundsOf(layer),
        palette: WIND_PALETTE,
        opacity: WIND_RASTER_OPACITY,
        parameters: PREMULTIPLIED_ALPHA_BLENDING,
        extensions: [new ClipExtension()],
        clipBounds: boundsOf(layer),
      })
  );
}

/**
 * Particules animées de chaque couche. À dessiner dans un calque deck.gl à part, au-dessus
 * de la carte (non interleaved) : chaque image d'animation ne redessine alors pas toute la
 * carte MapLibre.
 */
export function windParticleLayers(layers: WindLayerData[]) {
  return layers.map((layer) => {
    const [minLon, minLat, maxLon, maxLat] = boundsOf(layer);
    const area = (maxLon - minLon) * (maxLat - minLat);
    return new ParticleLayer({
      id: `wind-particles-${layer.id}`,
      image: layer.image,
      imageUnscale: layer.imageUnscale,
      bounds: boundsOf(layer),
      numParticles: Math.min(MAX_PARTICLES, Math.round(area * PARTICLES_PER_SQUARE_DEGREE)),
      speedFactor: 3.0,
      width: 1,
      opacity: 0.85,
      maxAge: 100,
      animate: true,
      color: PARTICLE_COLOR,
      extensions: [new ClipExtension()],
      clipBounds: boundsOf(layer),
    });
  });
}
