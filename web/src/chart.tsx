import { useMemo } from "react";
import { skylineAt, skylineDistance, skylineIsSea, terrainSun, type HorizonResult } from "./horizon";
import { compass, dayTimes, seasonDates, splitDate, sunAt, zonedInstant, type Point } from "./sun";
import { clock, distance } from "./format";
import { fill } from "./i18n";
import { useUi } from "./ui";

const W = 340,
  H = 132,
  BOTTOM = 16;

type Track = { azimuth: number; altitude: number }[];
// The Sun's low path on one side of the sky, sampled every two minutes.
function track(p: Point, date: string, tz: string, side: "rise" | "set", top: number): Track {
  const out: Track = [];
  const from = side === "rise" ? 0 : 12 * 60,
    to = side === "rise" ? 14 * 60 : 24 * 60;
  for (let m = from; m <= to; m += 2) {
    const s = sunAt(p, zonedInstant(date, m, tz));
    if (s.altitude > -3 && s.altitude < top + 3) out.push({ azimuth: s.azimuth, altitude: s.altitude });
  }
  // Keep only the arc on the requested side of the meridian.
  return out.filter((s) => (side === "rise" ? s.azimuth < 180 : s.azimuth > 180));
}

export function HorizonChart({
  horizon,
  point,
  date,
  tz,
  side,
  at,
  edge,
}: {
  horizon: HorizonResult;
  point: Point;
  date: string;
  tz: string;
  side: "rise" | "set";
  at: Date;
  edge: Date | null;
}) {
  const { t } = useUi();
  const geometry = useMemo(() => {
    // Frame the azimuths the Sun uses through the year on this side.
    const solstices = seasonDates(splitDate(date).y, tz, point.lat).filter((s) => s.event === "solstice");
    // Include where the Sun actually clears the terrain, which a high ridge
    // pushes well past the sea-level sunrise.
    const azimuths: number[] = [];
    for (const day of [...solstices.map((s) => s.date), date]) {
      const times = dayTimes(point, day, tz);
      const light = terrainSun(horizon, point, day, tz);
      for (const moment of side === "rise" ? [times.sunrise, light.firstLight] : [times.sunset, light.lastLight])
        if (moment) azimuths.push(sunAt(point, moment).azimuth);
    }
    if (!azimuths.length) azimuths.push(side === "rise" ? 90 : 270);
    const a0 = Math.min(...azimuths) - 12,
      a1 = Math.max(...azimuths) + 12;
    let peak = 0;
    for (let a = a0; a <= a1; a += 0.5) peak = Math.max(peak, skylineAt(horizon, a));
    const top = Math.min(30, Math.max(6, Math.ceil(peak + 3)));
    const bottom = -1.5;
    const x = (az: number) => ((az - a0) / (a1 - a0)) * W;
    const y = (alt: number) => (H - BOTTOM) * (1 - (alt - bottom) / (top - bottom));
    // Land fills below the skyline; stretches where the skyline is open sea turn blue.
    let ground = `M0 ${H}`;
    const sea: string[][] = [];
    let run: string[] = [];
    for (let a = a0; a <= a1 + 0.01; a += 0.5) {
      const px = x(a).toFixed(1),
        py = y(skylineAt(horizon, a)).toFixed(1);
      ground += ` L${px} ${py}`;
      if (skylineIsSea(horizon, a)) run.push(`${px} ${py}`);
      else if (run.length) {
        sea.push(run);
        run = [];
      }
    }
    if (run.length) sea.push(run);
    ground += ` L${W} ${H} Z`;
    const seaPaths = sea.map((points) => {
      const first = points[0].split(" ")[0],
        last = points[points.length - 1].split(" ")[0];
      return `M${first} ${H} L${points.join(" L")} L${last} ${H} Z`;
    });
    const toPath = (points: Track) =>
      points.map((s, i) => `${i ? "L" : "M"}${x(s.azimuth).toFixed(1)} ${y(s.altitude).toFixed(1)}`).join(" ");
    const seasons = solstices.map((s) => ({ key: s.key, d: toPath(track(point, s.date, tz, side, top)) }));
    const ticks: { x: number; label: string }[] = [];
    for (let a = Math.ceil(a0 / 22.5) * 22.5; a <= a1; a += 22.5)
      if (x(a) > 14 && x(a) < W - 14) ticks.push({ x: x(a), label: compass(a) });
    return { a0, a1, top, x, y, ground, seaPaths, seasons, ticks, today: toPath(track(point, date, tz, side, top)) };
  }, [horizon, point.lat, point.lng, date, tz, side]);

  const { x, y } = geometry;
  const sun = sunAt(point, at);
  const showSun = sun.azimuth >= geometry.a0 && sun.azimuth <= geometry.a1 && sun.altitude > -1.5 && sun.altitude < geometry.top;
  const mark = edge ? sunAt(point, edge) : null;
  const label = side === "rise" ? t.sunriseSide : t.sunsetSide;
  return (
    <figure className="horizon-chart">
      <figcaption>
        <span>{label}</span>
        {mark && (
          <small>{fill(t.skylineAt, { distance: distance(skylineDistance(horizon, mark.azimuth)) })}</small>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <line className="chart-zero" x1="0" x2={W} y1={y(0)} y2={y(0)} />
        {geometry.seasons.map((s) => (
          <path key={s.key} className={`chart-season chart-${s.key}`} d={s.d} />
        ))}
        <path className="chart-today" d={geometry.today} />
        <path className="chart-ground" d={geometry.ground} />
        {geometry.seaPaths.map((d, i) => (
          <path key={i} className="chart-sea" d={d} />
        ))}
        {mark && (
          <g className="chart-edge">
            <circle cx={x(mark.azimuth)} cy={y(mark.altitude)} r="5" />
            <text
              x={Math.min(W - 22, Math.max(22, x(mark.azimuth)))}
              y={Math.max(12, y(mark.altitude) - 10)}
              textAnchor="middle"
            >
              {clock(edge, tz)}
            </text>
          </g>
        )}
        {showSun && <circle className="chart-sun" cx={x(sun.azimuth)} cy={y(sun.altitude)} r="5.5" />}
        {geometry.ticks.map((tick) => (
          <text key={tick.label + tick.x} className="chart-tick" x={tick.x} y={H - 4} textAnchor="middle">
            {tick.label}
          </text>
        ))}
      </svg>
    </figure>
  );
}
