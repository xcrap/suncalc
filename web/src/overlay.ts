import { bearingLine, dayTimes, destination, seasonDates, splitDate, sunAt, type Point } from "./sun";

type Feature = {
  type: "Feature";
  properties: Record<string, string | number>;
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Point"; coordinates: [number, number] }
    | { type: "Polygon"; coordinates: [number, number][][] };
};
export type Collection = { type: "FeatureCollection"; features: Feature[] };
const collection = (features: Feature[]): Collection => ({ type: "FeatureCollection", features });
const line = (kind: string, coordinates: [number, number][]): Feature => ({
  type: "Feature",
  properties: { kind },
  geometry: { type: "LineString", coordinates },
});

/** Rays toward this year's solstice sunrises and sunsets: the yearly range. */
export function seasonRays(p: Point, date: string, tz: string, length: number) {
  const features: Feature[] = [];
  for (const mark of seasonDates(splitDate(date).y, tz, p.lat)) {
    if (mark.event !== "solstice") continue;
    const times = dayTimes(p, mark.date, tz);
    for (const [edge, at] of [
      ["rise", times.sunrise],
      ["set", times.sunset],
    ] as const)
      if (at) features.push(line(`${mark.key}-${edge}`, bearingLine(p, sunAt(p, at).azimuth, length)));
  }
  return collection(features);
}

/** Rays toward the day's sunrise and sunset, and the Sun at the chosen time. */
export function dayRays(p: Point, sunrise: Date | null, sunset: Date | null, at: Date, length: number) {
  const features: Feature[] = [];
  if (sunrise) features.push(line("sunrise", bearingLine(p, sunAt(p, sunrise).azimuth, length)));
  if (sunset) features.push(line("sunset", bearingLine(p, sunAt(p, sunset).azimuth, length)));
  const sun = sunAt(p, at);
  features.push(line(sun.altitude > -0.833 ? "sun" : "sun-below", bearingLine(p, sun.azimuth, length)));
  return collection(features);
}

/**
 * A small sky chart around the pin: the ring is the horizon, the centre the
 * zenith, and the arc is the Sun's path through the day.
 */
export function skyDial(
  p: Point,
  path: { azimuth: number; altitude: number }[],
  sun: { azimuth: number; altitude: number },
  radius: number,
) {
  const ring: [number, number][] = [];
  for (let a = 0; a <= 360; a += 6) ring.push(destination(p, a, radius));
  const features: Feature[] = [
    { type: "Feature", properties: { kind: "disk" }, geometry: { type: "Polygon", coordinates: [ring] } },
    line("ring", ring),
  ];
  for (const a of [0, 90, 180, 270])
    features.push(line(a === 0 ? "north" : "tick", [destination(p, a, radius * 0.88), destination(p, a, radius * 1.08)]));
  // Split the arc wherever the Sun is below the horizon.
  let arc: [number, number][] = [];
  for (const s of path) {
    if (s.altitude > 0) arc.push(destination(p, s.azimuth, radius * (1 - s.altitude / 90)));
    else if (arc.length) {
      if (arc.length > 1) features.push(line("path", arc));
      arc = [];
    }
  }
  if (arc.length > 1) features.push(line("path", arc));
  if (sun.altitude > 0)
    features.push({
      type: "Feature",
      properties: { kind: "sun" },
      geometry: { type: "Point", coordinates: destination(p, sun.azimuth, radius * (1 - sun.altitude / 90)) },
    });
  return collection(features);
}
