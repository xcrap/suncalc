import type { Lang } from "./i18n";

const locales = { en: "en-GB", pt: "pt-PT" } as const;
const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(lang: Lang, tz: string, options: Intl.DateTimeFormatOptions) {
  const key = `${lang}|${tz}|${JSON.stringify(options)}`;
  let value = cache.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat(locales[lang], { timeZone: tz, ...options });
    cache.set(key, value);
  }
  return value;
}
// Times round to the nearest minute, as almanacs print them.
export const roundMinute = (at: Date) => new Date(Math.round(at.getTime() / 60000) * 60000);
export const clock = (at: Date | null | undefined, lang: Lang, tz: string) =>
  at ? formatter(lang, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(roundMinute(at)) : "—";
export const minutesClock = (minutes: number) => {
  const m = Math.round(minutes) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
// Calendar dates are plain days, so they are formatted in UTC.
export function dayLabel(date: string, lang: Lang, style: "long" | "short" | "weekday" = "long") {
  const [y, m, d] = date.split("-").map(Number);
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "weekday"
        ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
        : { day: "numeric", month: "long", year: "numeric" };
  return formatter(lang, "UTC", options).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
export function zoneLabel(at: Date, lang: Lang, tz: string) {
  const part = formatter(lang, tz, { timeZoneName: "shortOffset" })
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
export function shortDuration(seconds: number) {
  const s = Math.round(Math.abs(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60),
    rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}
export const number = (value: number, lang: Lang, digits = 0) =>
  value.toLocaleString(locales[lang], { maximumFractionDigits: digits, minimumFractionDigits: digits });
export function distance(metres: number, lang: Lang) {
  return metres < 1000 ? `${number(Math.round(metres / 10) * 10, lang)} m` : `${number(metres / 1000, lang, metres < 10000 ? 1 : 0)} km`;
}
export const degrees = (value: number, lang: Lang, digits = 0) => `${number(value, lang, digits)}°`;
export function shadowLength(metres: number, lang: Lang) {
  if (metres < 10) return `${number(metres, lang, 1)} m`;
  return metres < 1000 ? `${number(Math.round(metres), lang)} m` : `${number(metres / 1000, lang, 1)} km`;
}
