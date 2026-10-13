import * as SunCalc from "suncalc";
import tzlookup from "@photostructure/tz-lookup";

// All angles are degrees; azimuth is clockwise from north.
export type Point = { lat: number; lng: number };

// Photographers' light: blue hour −6°…−4°, golden hour −4°…+6°.
SunCalc.addTime(-4, "blueHourEnd", "blueHour");

export function timeZoneAt(p: Point) {
  try {
    return tzlookup(p.lat, p.lng);
  } catch {
    return "UTC";
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string, at: Date) {
  let format = formatters.get(tz);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, format);
  }
  const out: Record<string, number> = {};
  for (const part of format.formatToParts(at))
    if (part.type !== "literal") out[part.type] = Number(part.value);
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
/** Minutes east of UTC for the zone at an instant. */
export function zoneOffset(tz: string, at: Date) {
  const p = parts(tz, at);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}
const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export function splitDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}
/** The instant a wall clock in `tz` shows `minutes` past midnight on `date`. */
export function zonedInstant(date: string, minutes: number, tz: string) {
  const { y, m, d } = splitDate(date);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = wall - zoneOffset(tz, new Date(wall)) * 60000;
  guess = wall - zoneOffset(tz, new Date(guess)) * 60000;
  return new Date(guess);
}
export function localDate(at: Date, tz: string) {
  const p = parts(tz, at);
  return isoDate(p.year, p.month, p.day);
}
export function localMinutes(at: Date, tz: string) {
  const p = parts(tz, at);
  return (p.hour % 24) * 60 + p.minute + p.second / 60;
}
export function shiftDate(date: string, days: number) {
  const { y, m, d } = splitDate(date);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export type DayTimes = {
  nightEnd: Date | null;
  nauticalDawn: Date | null;
  dawn: Date | null;
  blueHourEnd: Date | null;
  sunrise: Date | null;
  goldenHourEnd: Date | null;
  solarNoon: Date;
  goldenHour: Date | null;
  sunset: Date | null;
  blueHour: Date | null;
  dusk: Date | null;
  nauticalDusk: Date | null;
  night: Date | null;
  alwaysUp: boolean;
  alwaysDown: boolean;
};
export function dayTimes(p: Point, date: string, tz: string): DayTimes {
  const noon = zonedInstant(date, 12 * 60, tz);
  const t = SunCalc.getTimes(noon, p.lat, p.lng, 0, zoneOffset(tz, noon));
  const get = (key: string) => (t[key] instanceof Date ? (t[key] as Date) : null);
  return {
    nightEnd: get("nightEnd"),
    nauticalDawn: get("nauticalDawn"),
    dawn: get("dawn"),
    blueHourEnd: get("blueHourEnd"),
    sunrise: get("sunrise"),
    goldenHourEnd: get("goldenHourEnd"),
    solarNoon: t.solarNoon,
    goldenHour: get("goldenHour"),
    sunset: get("sunset"),
    blueHour: get("blueHour"),
    dusk: get("dusk"),
    nauticalDusk: get("nauticalDusk"),
    night: get("night"),
    alwaysUp: !!t.alwaysUp,
    alwaysDown: !!t.alwaysDown,
  };
}
export const sunAt = (p: Point, at: Date) => SunCalc.getPosition(at, p.lat, p.lng);
export const moonAt = (p: Point, at: Date) => SunCalc.getMoonPosition(at, p.lat, p.lng);
export function moonDay(p: Point, date: string, tz: string) {
  const noon = zonedInstant(date, 12 * 60, tz);
  const times = SunCalc.getMoonTimes(noon, p.lat, p.lng, zoneOffset(tz, noon));
  return { ...times, light: SunCalc.getMoonIllumination(noon) };
}
export function dayLength(t: DayTimes) {
  if (t.alwaysUp) return 24 * 60;
  if (!t.sunrise || !t.sunset) return 0;
  return (t.sunset.getTime() - t.sunrise.getTime()) / 60000;
}

/** Sun positions through the local day, one every `step` minutes. */
export function sunPath(p: Point, date: string, tz: string, step = 10) {
  const out: { minutes: number; azimuth: number; altitude: number }[] = [];
  for (let minutes = 0; minutes <= 1440; minutes += step) {
    const pos = sunAt(p, zonedInstant(date, minutes, tz));
    out.push({ minutes, azimuth: pos.azimuth, altitude: pos.altitude });
  }
  return out;
}

// Apparent solar longitude (Meeus, low precision: about 0.01°).
function solarLongitude(ms: number) {
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
  const rad = Math.PI / 180;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * rad;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * rad;
  return (((L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) % 360) + 360) % 360;
}
const seasonCache = new Map<string, Date>();
/** The instant the Sun reaches an ecliptic longitude: 0 March equinox, 90 June solstice… */
export function seasonInstant(year: number, longitude: 0 | 90 | 180 | 270) {
  const key = `${year}:${longitude}`;
  const cached = seasonCache.get(key);
  if (cached) return cached;
  const month = { 0: 2, 90: 5, 180: 8, 270: 11 }[longitude];
  const day = { 0: 20, 90: 21, 180: 22, 270: 21 }[longitude];
  const centre = Date.UTC(year, month, day, 12);
  let lo = centre - 4 * 86400000,
    hi = centre + 4 * 86400000;
  const offset = (ms: number) => ((solarLongitude(ms) - longitude + 540) % 360) - 180;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (offset(mid) < 0) lo = mid;
    else hi = mid;
  }
  const result = new Date((lo + hi) / 2);
  seasonCache.set(key, result);
  return result;
}
export type SeasonKey = "spring" | "summer" | "autumn" | "winter";
export const SEASON_MARKS: { key: SeasonKey; longitude: 0 | 90 | 180 | 270; event: "equinox" | "solstice" }[] = [
  { key: "spring", longitude: 0, event: "equinox" },
  { key: "summer", longitude: 90, event: "solstice" },
  { key: "autumn", longitude: 180, event: "equinox" },
  { key: "winter", longitude: 270, event: "solstice" },
];
/** Northern seasons flip south of the equator. */
export function seasonDates(year: number, tz: string, lat: number) {
  const flip = lat < 0;
  return SEASON_MARKS.map((mark) => {
    const at = seasonInstant(year, mark.longitude);
    const key = flip
      ? ({ spring: "autumn", summer: "winter", autumn: "spring", winter: "summer" } as const)[mark.key]
      : mark.key;
    return { key, event: mark.event, at, date: localDate(at, tz) };
  });
}
export function seasonOf(date: string, tz: string, lat: number): SeasonKey {
  const { y } = splitDate(date);
  const marks = seasonDates(y, tz, lat);
  let season = marks[3].key; // before the March equinox it is still December's season
  for (const mark of marks) if (date >= mark.date) season = mark.key;
  return season;
}

const EARTH = 6371008.8;
const rad = Math.PI / 180;
/** Point at a distance along a great circle, as [lng, lat]. */
export function destination(p: Point, bearing: number, meters: number): [number, number] {
  const d = meters / EARTH,
    b = bearing * rad,
    lat1 = p.lat * rad,
    lng1 = p.lng * rad;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 =
    lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [((lng2 / rad + 540) % 360) - 180, lat2 / rad];
}
export function bearingLine(p: Point, bearing: number, meters: number, steps = 24) {
  const line: [number, number][] = [[p.lng, p.lat]];
  for (let i = 1; i <= steps; i++) line.push(destination(p, bearing, (meters * i) / steps));
  return line;
}
/** Ground metres per CSS pixel in MapLibre's 512-pixel tiles. */
export const metersPerPixel = (lat: number, zoom: number) =>
  (40075016.686 * Math.cos(lat * rad)) / (512 * 2 ** zoom);

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export function compass(azimuth: number) {
  const index = Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[index];
}
