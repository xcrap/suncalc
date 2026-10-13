const LOCALE = "en-GB";
const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string, options: Intl.DateTimeFormatOptions) {
  const key = `${tz}|${JSON.stringify(options)}`;
  let value = cache.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat(LOCALE, { timeZone: tz, ...options });
    cache.set(key, value);
  }
  return value;
}
// Times round to the nearest minute, as almanacs print them.
export const roundMinute = (at: Date) => new Date(Math.round(at.getTime() / 60000) * 60000);
export const clock = (at: Date | null | undefined, tz: string) =>
  at ? formatter(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(roundMinute(at)) : "—";
export const minutesClock = (minutes: number) => {
  const m = Math.round(minutes) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
// Calendar dates are plain days, so they are formatted in UTC.
export function dayLabel(date: string, style: "long" | "short" | "weekday" = "long") {
  const [y, m, d] = date.split("-").map(Number);
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "weekday"
        ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
        : { day: "numeric", month: "long", year: "numeric" };
  return formatter("UTC", options).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
export function zoneLabel(at: Date, tz: string) {
  const part = formatter(tz, { timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value.replace("GMT", "UTC") || tz;
}
export function duration(minutes: number) {
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60),
    m = total % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}
export const number = (value: number, digits = 0) =>
  value.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits });
export function distance(metres: number) {
  return metres < 1000 ? `${number(Math.round(metres / 10) * 10)} m` : `${number(metres / 1000, metres < 10000 ? 1 : 0)} km`;
}
export const degrees = (value: number, digits = 0) => `${number(value, digits)}°`;
export function shadowLength(metres: number) {
  if (metres < 10) return `${number(metres, 1)} m`;
  return metres < 1000 ? `${number(Math.round(metres))} m` : `${number(metres / 1000, 1)} km`;
}
