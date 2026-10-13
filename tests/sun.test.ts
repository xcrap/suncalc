import { expect, test } from "bun:test";
import {
  compass,
  dayTimes,
  localDate,
  localMinutes,
  seasonDates,
  seasonInstant,
  seasonOf,
  sunAt,
  timeZoneAt,
  zonedInstant,
} from "../web/src/sun";
import { terrainSun } from "../web/src/horizon";
import type { HorizonResult } from "../web/src/terrain";

const pontaDelgada = { lat: 37.73952, lng: -25.66872 };
const near = (a: Date, iso: string, minutes: number) =>
  expect(Math.abs(a.getTime() - new Date(iso).getTime()) / 60000).toBeLessThan(minutes);

test("Azores wall clock follows summer time", () => {
  expect(timeZoneAt(pontaDelgada)).toBe("Atlantic/Azores");
  expect(zonedInstant("2026-06-21", 12 * 60, "Atlantic/Azores").toISOString()).toBe("2026-06-21T12:00:00.000Z");
  expect(zonedInstant("2026-12-21", 12 * 60, "Atlantic/Azores").toISOString()).toBe("2026-12-21T13:00:00.000Z");
  const at = new Date("2026-12-21T13:30:00Z");
  expect(localDate(at, "Atlantic/Azores")).toBe("2026-12-21");
  expect(localMinutes(at, "Atlantic/Azores")).toBe(12 * 60 + 30);
});

test("equinoxes and solstices land on the published instants", () => {
  near(seasonInstant(2026, 0), "2026-03-20T14:46Z", 20);
  near(seasonInstant(2026, 90), "2026-06-21T08:24Z", 20);
  near(seasonInstant(2026, 180), "2026-09-23T00:05Z", 20);
  near(seasonInstant(2026, 270), "2026-12-21T20:50Z", 20);
  // 00:05 UTC is still 22 September on Azores winter time but 23 on summer time (UTC+0).
  expect(seasonDates(2026, "Atlantic/Azores", pontaDelgada.lat).map((s) => s.date)).toEqual([
    "2026-03-20",
    "2026-06-21",
    "2026-09-23",
    "2026-12-21",
  ]);
});

test("seasons flip south of the equator", () => {
  expect(seasonOf("2026-07-10", "Atlantic/Azores", 37.7)).toBe("summer");
  expect(seasonOf("2026-01-10", "Atlantic/Azores", 37.7)).toBe("winter");
  expect(seasonOf("2026-07-10", "Australia/Sydney", -33.9)).toBe("winter");
});

test("Ponta Delgada sunrise and sunset", () => {
  const winter = dayTimes(pontaDelgada, "2026-12-21", "Atlantic/Azores");
  near(winter.sunrise!, "2026-12-21T08:56Z", 3); // 07:56 local
  near(winter.sunset!, "2026-12-21T18:29Z", 3); // 17:29 local
  const summer = dayTimes(pontaDelgada, "2026-06-21", "Atlantic/Azores");
  const rise = sunAt(pontaDelgada, summer.sunrise!).azimuth;
  expect(rise).toBeGreaterThan(55);
  expect(rise).toBeLessThan(65);
  expect(compass(rise, "en")).toBe("ENE");
  expect(compass(rise + 180, "pt")).toBe("OSO");
});

function wall(angle: (azimuth: number) => number): HorizonResult {
  const angles = new Float32Array(720);
  for (let i = 0; i < 720; i++) angles[i] = angle(i / 2);
  return {
    id: 1,
    ...pontaDelgada,
    elevation: 0,
    angles,
    distances: new Float32Array(720).fill(1000),
    sea: new Uint8Array(720),
  };
}

test("terrain delays the first direct sun", () => {
  const times = dayTimes(pontaDelgada, "2026-12-21", "Atlantic/Azores");
  const flat = terrainSun(wall(() => -0.3), pontaDelgada, "2026-12-21", "Atlantic/Azores");
  near(flat.firstLight!, times.sunrise!.toISOString(), 3);
  near(flat.lastLight!, times.sunset!.toISOString(), 3);
  // A 10° ridge on the eastern side holds back the morning only.
  const ridge = terrainSun(wall((az) => (az < 180 ? 10 : -0.3)), pontaDelgada, "2026-12-21", "Atlantic/Azores");
  expect((ridge.firstLight!.getTime() - times.sunrise!.getTime()) / 60000).toBeGreaterThan(40);
  near(ridge.lastLight!, times.sunset!.toISOString(), 3);
  expect(ridge.minutes).toBeLessThan(flat.minutes);
  const walled = terrainSun(wall(() => 45), pontaDelgada, "2026-12-21", "Atlantic/Azores");
  expect(walled).toEqual({ firstLight: null, lastLight: null, minutes: 0 });
});
