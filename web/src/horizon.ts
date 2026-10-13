import { useEffect, useRef, useState } from "react";
import { sunAt, zonedInstant, type Point } from "./sun";
import type { HorizonJob, HorizonResult } from "./terrain";

export type { HorizonResult };

let worker: Worker | null = null;
let nextId = 0;
const listeners = new Set<(result: HorizonResult) => void>();
function horizonWorker() {
  if (!worker) {
    worker = new Worker(new URL("./horizon.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<HorizonResult>) => {
      for (const listener of listeners) listener(event.data);
    };
  }
  return worker;
}

/** The skyline around a point; recomputed only when the point moves. */
export function useHorizon(point: Point) {
  const [result, setResult] = useState<HorizonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef(0);
  useEffect(() => {
    const listener = (value: HorizonResult) => {
      if (value.id !== pending.current) return;
      setResult(value);
      setLoading(false);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    // Wait for the pin to settle before fetching terrain.
    const timer = setTimeout(() => {
      const id = ++nextId;
      pending.current = id;
      setLoading(true);
      horizonWorker().postMessage({ id, lat: point.lat, lng: point.lng } satisfies HorizonJob);
    }, 250);
    return () => clearTimeout(timer);
  }, [point.lat, point.lng]);
  const current = result && result.lat === point.lat && result.lng === point.lng ? result : null;
  return { horizon: current, loading: loading || !current };
}

export function skylineAt(h: HorizonResult, azimuth: number) {
  const steps = h.angles.length;
  const x = ((((azimuth % 360) + 360) % 360) / 360) * steps;
  const i = Math.floor(x) % steps,
    j = (i + 1) % steps,
    f = x - Math.floor(x);
  return h.angles[i] * (1 - f) + h.angles[j] * f;
}
const nearest = (h: HorizonResult, azimuth: number) =>
  Math.round(((((azimuth % 360) + 360) % 360) / 360) * h.angles.length) % h.angles.length;
export const skylineDistance = (h: HorizonResult, azimuth: number) => h.distances[nearest(h, azimuth)];
export const skylineIsSea = (h: HorizonResult, azimuth: number) => h.sea[nearest(h, azimuth)] === 1;

// The Sun counts as visible once its upper edge clears the skyline.
const SEMI_DIAMETER = 0.27;
function visible(h: HorizonResult, p: Point, at: Date) {
  const sun = sunAt(p, at);
  return sun.altitude + SEMI_DIAMETER > skylineAt(h, sun.azimuth);
}
function refine(h: HorizonResult, p: Point, before: Date, after: Date, rising: boolean) {
  let lo = before.getTime(),
    hi = after.getTime();
  while (hi - lo > 5000) {
    const mid = (lo + hi) / 2;
    if (visible(h, p, new Date(mid)) === rising) hi = mid;
    else lo = mid;
  }
  return new Date((lo + hi) / 2);
}
export type TerrainSun = { firstLight: Date | null; lastLight: Date | null; minutes: number };
/** When direct sunlight first and last reaches the point, over the real skyline. */
export function terrainSun(h: HorizonResult, p: Point, date: string, tz: string): TerrainSun {
  let previous: { at: Date; up: boolean } | null = null;
  let firstLight: Date | null = null,
    lastLight: Date | null = null,
    minutes = 0;
  for (let m = 0; m <= 1440; m += 2) {
    const at = zonedInstant(date, m, tz);
    const up = visible(h, p, at);
    if (up && m < 1440) minutes += 2;
    if (previous && up !== previous.up) {
      const edge = refine(h, p, previous.at, at, up);
      if (up && !firstLight) firstLight = edge;
      if (!up) lastLight = edge;
    }
    previous = { at, up };
  }
  return { firstLight, lastLight, minutes };
}
