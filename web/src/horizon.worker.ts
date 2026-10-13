/// <reference lib="webworker" />
// Builds the terrain skyline around a point from open elevation tiles
// (Mapzen Terrarium on AWS Open Data): the highest apparent angle of the
// ground in every direction, accounting for Earth's curvature and refraction.
import { TERRAIN_TILES, type HorizonJob, type HorizonResult } from "./terrain";

const EARTH = 6371008.8;
const REFRACTION = 0.13;
const EYE = 1.7;
const STEPS = 720; // one ray every half degree
const LEVELS = [
  { zoom: 12, radius: 4_500 },
  { zoom: 10, radius: 32_000 },
  { zoom: 8, radius: 170_000 },
];
const MAX_DISTANCE = 160_000;

type Mosaic = { zoom: number; x0: number; y0: number; cols: number; rows: number; data: Int16Array };

const cache = new Map<string, Promise<Int16Array | null>>();
function tile(z: number, x: number, y: number) {
  const key = `${z}/${x}/${y}`;
  let value = cache.get(key);
  if (value) {
    cache.delete(key);
    cache.set(key, value);
    return value;
  }
  value = decode(z, x, y);
  cache.set(key, value);
  // Each tile holds 128 KB; keep the most recent ones only.
  while (cache.size > 160) cache.delete(cache.keys().next().value!);
  return value;
}
async function decode(z: number, x: number, y: number) {
  try {
    const url = TERRAIN_TILES.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
    const response = await fetch(url);
    if (!response.ok) return null;
    // Terrarium packs elevation into RGB, so the browser must not touch the colours.
    const bitmap = await createImageBitmap(await response.blob(), {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
    });
    const canvas = new OffscreenCanvas(256, 256);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = context.getImageData(0, 0, 256, 256).data;
    const out = new Int16Array(256 * 256);
    for (let i = 0; i < out.length; i++) {
      const h = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
      // The sea surface is the floor; bathymetry never blocks the view.
      out[i] = h > 0 ? Math.round(h) : 0;
    }
    return out;
  } catch {
    return null;
  }
}

const worldX = (lng: number, zoom: number) => ((lng + 180) / 360) * 256 * 2 ** zoom;
function worldY(lat: number, zoom: number) {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** zoom;
}

async function mosaic(lat: number, lng: number, zoom: number, radius: number): Promise<Mosaic> {
  const dLat = (radius / EARTH) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const max = 2 ** zoom - 1;
  const x0 = Math.max(0, Math.floor(worldX(lng - dLng, zoom) / 256));
  const x1 = Math.min(max, Math.floor(worldX(lng + dLng, zoom) / 256));
  const y0 = Math.max(0, Math.floor(worldY(lat + dLat, zoom) / 256));
  const y1 = Math.min(max, Math.floor(worldY(lat - dLat, zoom) / 256));
  const cols = x1 - x0 + 1,
    rows = y1 - y0 + 1;
  const data = new Int16Array(cols * 256 * rows * 256);
  const jobs: Promise<void>[] = [];
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      jobs.push(
        tile(zoom, tx, ty).then((pixels) => {
          if (!pixels) return;
          const stride = cols * 256;
          const ox = (tx - x0) * 256,
            oy = (ty - y0) * 256;
          for (let row = 0; row < 256; row++)
            data.set(pixels.subarray(row * 256, row * 256 + 256), (oy + row) * stride + ox);
        }),
      );
  await Promise.all(jobs);
  return { zoom, x0, y0, cols, rows, data };
}
// Bilinear elevation, or NaN outside the mosaic.
function sample(m: Mosaic, lat: number, lng: number) {
  const x = worldX(lng, m.zoom) - m.x0 * 256 - 0.5;
  const y = worldY(lat, m.zoom) - m.y0 * 256 - 0.5;
  const w = m.cols * 256,
    h = m.rows * 256;
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return NaN;
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const i = iy * w + ix;
  const d = m.data;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + w] * (1 - fx) + d[i + w + 1] * fx) * fy;
}

async function run(job: HorizonJob): Promise<HorizonResult> {
  const mosaics = await Promise.all(LEVELS.map((l) => mosaic(job.lat, job.lng, l.zoom, l.radius)));
  const ground = sample(mosaics[0], job.lat, job.lng);
  const elevation = Number.isFinite(ground) ? Math.max(0, ground) : 0;
  const eye = elevation + EYE;
  const angles = new Float32Array(STEPS);
  const distances = new Float32Array(STEPS);
  const sea = new Uint8Array(STEPS);
  const lat0 = (job.lat * Math.PI) / 180;
  const cosLat = Math.cos(lat0);
  for (let i = 0; i < STEPS; i++) {
    const az = (i * 360) / STEPS;
    const north = Math.cos((az * Math.PI) / 180),
      east = Math.sin((az * Math.PI) / 180);
    let best = -Infinity,
      bestDistance = MAX_DISTANCE,
      bestSea = 1;
    for (let d = 25; d <= MAX_DISTANCE; d += Math.max(15, d * 0.008)) {
      const lat = job.lat + ((d * north) / EARTH) * (180 / Math.PI);
      const lng = job.lng + ((d * east) / (EARTH * cosLat)) * (180 / Math.PI);
      const level = d < 4_000 ? 0 : d < 30_000 ? 1 : 2;
      let h = sample(mosaics[level], lat, lng);
      if (!Number.isFinite(h)) h = sample(mosaics[2], lat, lng);
      if (!Number.isFinite(h)) h = 0;
      const drop = ((d * d) / (2 * EARTH)) * (1 - REFRACTION);
      const angle = Math.atan((h - drop - eye) / d);
      if (angle > best) {
        best = angle;
        bestDistance = d;
        bestSea = h < 1 ? 1 : 0;
      }
    }
    angles[i] = (best * 180) / Math.PI;
    distances[i] = bestDistance;
    sea[i] = bestSea;
  }
  return { id: job.id, lat: job.lat, lng: job.lng, elevation, angles, distances, sea };
}

let latest = 0;
self.onmessage = async (event: MessageEvent<HorizonJob>) => {
  latest = event.data.id;
  const result = await run(event.data);
  // A newer point supersedes this one; skip posting stale work.
  if (result.id !== latest) return;
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(result, [
    result.angles.buffer,
    result.distances.buffer,
    result.sea.buffer,
  ]);
};
