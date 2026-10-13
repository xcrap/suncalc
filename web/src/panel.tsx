import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  Moon,
  Mountain,
  Sunrise,
  Sunset,
} from "lucide-react";
import { HorizonChart } from "./chart";
import { clock, dayLabel, degrees, duration, minutesClock, number, shadowLength, zoneLabel } from "./format";
import type { HorizonResult, TerrainSun } from "./horizon";
import { fill } from "./i18n";
import { compass, dayLength, moonDay, seasonDates, splitDate, sunAt, type DayTimes, type Point, type SeasonKey } from "./sun";
import { Spinner, useUi } from "./ui";

export function LocationCard({
  point,
  name,
  area,
  elevation,
  tz,
  at,
  onCopy,
  onSave,
}: {
  point: Point;
  name: string | null;
  area: string | null;
  elevation: number | null;
  tz: string;
  at: Date;
  onCopy: () => void;
  onSave: () => void;
}) {
  const { t } = useUi();
  return (
    <section className="location" aria-label={t.selectedSpot}>
      <div className="location-text">
        <h1>{name || t.selectedSpot}</h1>
        <p>
          {area && <span>{area}</span>}
          <span className="coords">
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
          </span>
          {elevation !== null && <span>{fill(t.elevation, { metres: number(Math.round(elevation)) })}</span>}
          <span title={`${t.timeZone}: ${tz}`}>{zoneLabel(at, tz)}</span>
        </p>
      </div>
      <div className="location-actions">
        <button className="icon-button" aria-label={t.copyLink} title={t.copyLink} onClick={onCopy}>
          <Link2 size={17} />
        </button>
        <button className="icon-button" aria-label={t.savePlace} title={t.savePlace} onClick={onSave}>
          <BookmarkPlus size={17} />
        </button>
      </div>
    </section>
  );
}

export function DateControls({
  date,
  today,
  point,
  tz,
  onDate,
}: {
  date: string;
  today: string;
  point: Point;
  tz: string;
  onDate: (date: string) => void;
}) {
  const { t } = useUi();
  // The next equinoxes and solstices from today, for planning ahead.
  const marks = useMemo(() => {
    const year = splitDate(today).y;
    const upcoming = [...seasonDates(year, tz, point.lat), ...seasonDates(year + 1, tz, point.lat)].filter(
      (m) => m.date >= today,
    );
    const order: SeasonKey[] = ["spring", "summer", "autumn", "winter"];
    return order.map((key) => upcoming.find((m) => m.key === key)!).filter(Boolean);
  }, [today, tz, point.lat < 0]);
  const shift = (days: number) => {
    const [y, m, d] = date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + days));
    onDate(next.toISOString().slice(0, 10));
  };
  return (
    <section className="date-controls" aria-label={t.date}>
      <div className="date-row">
        <button className="icon-button" aria-label={t.previousDay} onClick={() => shift(-1)}>
          <ChevronLeft size={18} />
        </button>
        <label className="date-field">
          <span aria-hidden="true">{dayLabel(date, "weekday")}</span>
          <input
            type="date"
            aria-label={t.date}
            value={date}
            required
            onClick={(event) => {
              try {
                event.currentTarget.showPicker();
              } catch {}
            }}
            onChange={(event) => event.target.value && onDate(event.target.value)}
          />
        </label>
        <button className="icon-button" aria-label={t.nextDay} onClick={() => shift(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="chips" role="group" aria-label={t.date}>
        <button className="chip" aria-pressed={date === today} onClick={() => onDate(today)}>
          {t.today}
        </button>
        {marks.map((m) => (
          <button
            key={m.key}
            className={`chip chip-${m.key}`}
            aria-pressed={date === m.date}
            title={`${t.seasonEvents[m.key]} · ${dayLabel(m.date)}`}
            onClick={() => onDate(m.date)}
          >
            {t[m.key]}
            <small>{dayLabel(m.date, "short")}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

const BANDS: [number, string][] = [
  [-18, "#1c2440"],
  [-12, "#29355c"],
  [-6, "#3d5185"],
  [-4, "#6383c2"],
  [6, "#f0b35b"],
  [Infinity, "#f6e3a4"],
];
const band = (altitude: number) => BANDS.find(([limit]) => altitude < limit)![1];

export function TimeSlider({
  minutes,
  live,
  path,
  tz,
  at,
  onMinutes,
  onNow,
}: {
  minutes: number;
  live: boolean;
  path: { minutes: number; altitude: number }[];
  tz: string;
  at: Date;
  onMinutes: (minutes: number) => void;
  onNow: () => void;
}) {
  const { t } = useUi();
  // Night, twilight, blue and golden hour painted along the day.
  const track = useMemo(() => {
    const stops: string[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const colour = band((path[i].altitude + path[i + 1].altitude) / 2);
      stops.push(`${colour} ${((path[i].minutes / 1440) * 100).toFixed(2)}% ${((path[i + 1].minutes / 1440) * 100).toFixed(2)}%`);
    }
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }, [path]);
  return (
    <section className="time-control" aria-label={t.time}>
      <div className="time-head">
        <Clock size={16} aria-hidden="true" />
        <output className="time-value">{minutesClock(minutes)}</output>
        <span className="muted">{zoneLabel(at, tz)}</span>
        <button className={`chip ${live ? "chip-live" : ""}`} aria-pressed={live} onClick={onNow}>
          {live && <i aria-hidden="true" />}
          {live ? t.live : t.now}
        </button>
      </div>
      <input
        className="time-range"
        type="range"
        min={0}
        max={1439}
        step={1}
        value={Math.round(minutes)}
        aria-label={t.time}
        aria-valuetext={minutesClock(minutes)}
        style={{ "--track": track } as CSSProperties}
        onChange={(event) => onMinutes(Number(event.target.value))}
      />
      <div className="time-scale" aria-hidden="true">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  detail,
  onSelect,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  onSelect?: () => void;
}) {
  const { t } = useUi();
  const content = (
    <>
      <span className="row-label">{label}</span>
      <span className="row-value">{value}</span>
      {detail && <span className="row-detail">{detail}</span>}
    </>
  );
  return onSelect ? (
    <button className="row" onClick={onSelect} title={fill(t.setTime, { label: String(label) })}>
      {content}
    </button>
  ) : (
    <div className="row">{content}</div>
  );
}

// Whole minutes between two instants as printed, so labels agree with the clock.
const minutesBetween = (later: Date | null, earlier: Date | null) =>
  later && earlier ? Math.round(later.getTime() / 60000) - Math.round(earlier.getTime() / 60000) : 0;

/** Sunrise and sunset first: the answer most visits come for. */
export function SunTiles({
  point,
  tz,
  times,
  light,
  onTime,
}: {
  point: Point;
  tz: string;
  times: DayTimes;
  light: TerrainSun | null;
  onTime: (at: Date) => void;
}) {
  const { t } = useUi();
  if (times.alwaysUp || times.alwaysDown)
    return <p className="muted">{times.alwaysUp ? t.alwaysUp : t.alwaysDown}</p>;
  const tile = (side: "sunrise" | "sunset") => {
    const moment = times[side];
    const position = moment ? sunAt(point, moment) : null;
    const edge = light ? (side === "sunrise" ? light.firstLight : light.lastLight) : null;
    const delay = side === "sunrise" ? minutesBetween(edge, moment) : minutesBetween(moment, edge);
    return (
      <button className={`sun-tile ${side}`} onClick={() => moment && onTime(moment)}>
        <span className="tile-label">
          {side === "sunrise" ? <Sunrise size={16} aria-hidden="true" /> : <Sunset size={16} aria-hidden="true" />}
          {t[side]}
        </span>
        <strong>{clock(moment, tz)}</strong>
        {position && (
          <small>
            {degrees(position.azimuth)} {compass(position.azimuth)}
          </small>
        )}
        <span className="tile-terrain">
          <Mountain size={13} aria-hidden="true" />
          {!light
            ? "…"
            : delay >= 2 && edge
              ? fill(side === "sunrise" ? t.directFrom : t.directUntil, { time: clock(edge, tz) })
              : t.clearHorizon}
        </span>
      </button>
    );
  };
  return (
    <div className="sun-pair">
      {tile("sunrise")}
      {tile("sunset")}
    </div>
  );
}

export function SunCard({
  point,
  tz,
  times,
  previous,
  at,
  onTime,
}: {
  point: Point;
  tz: string;
  times: DayTimes;
  previous: DayTimes;
  at: Date;
  onTime: (at: Date) => void;
}) {
  const { t } = useUi();
  const noon = sunAt(point, times.solarNoon);
  const length = dayLength(times);
  const change = length - dayLength(previous);
  const now = sunAt(point, at);
  const range = (a: Date | null, b: Date | null) => `${clock(a, tz)}–${clock(b, tz)}`;
  const select = (moment: Date | null) => (moment ? () => onTime(moment) : undefined);
  return (
    <section className="card" aria-labelledby="sun-title">
      <h2 id="sun-title" className="visually-hidden">
        {t.sun}
      </h2>
      <div className="rows">
        <Row
          label={t.solarNoon}
          value={clock(times.solarNoon, tz)}
          detail={`${t.altitude} ${degrees(noon.altitude)}`}
          onSelect={select(times.solarNoon)}
        />
        <Row
          label={t.dayLength}
          value={duration(length)}
          detail={
            Math.abs(change) < 0.5
              ? t.sameLength
              : fill(change > 0 ? t.longer : t.shorter, { duration: duration(change) })
          }
        />
        <Row
          label={t.goldenHour}
          value={`${range(times.blueHourEnd, times.goldenHourEnd)} · ${range(times.goldenHour, times.blueHour)}`}
          onSelect={select(times.goldenHour)}
        />
        <Row
          label={t.blueHour}
          value={`${range(times.dawn, times.blueHourEnd)} · ${range(times.blueHour, times.dusk)}`}
          onSelect={select(times.blueHour)}
        />
        <Row
          label={`${t.dawn} · ${t.dusk}`}
          value={`${clock(times.dawn, tz)} · ${clock(times.dusk, tz)}`}
        />
      </div>
      <div className="sun-now">
        <h3>{fill(t.sunAt, { time: clock(at, tz) })}</h3>
        {now.altitude > -0.833 ? (
          <dl>
            <div>
              <dt>{t.altitude}</dt>
              <dd>{degrees(now.altitude, 1)}</dd>
            </div>
            <div>
              <dt>{t.direction}</dt>
              <dd>
                {degrees(now.azimuth)} {compass(now.azimuth)}
              </dd>
            </div>
            <div>
              <dt>{t.shadow}</dt>
              <dd>
                {now.altitude > 0.5 ? shadowLength(1 / Math.tan((now.altitude * Math.PI) / 180)) : "∞"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">
            {t.belowHorizon} · {degrees(now.azimuth)} {compass(now.azimuth)}
          </p>
        )}
      </div>
    </section>
  );
}

export function HorizonCard({
  point,
  date,
  tz,
  times,
  at,
  horizon,
  light,
  loading,
  onTime,
}: {
  point: Point;
  date: string;
  tz: string;
  times: DayTimes;
  at: Date;
  horizon: HorizonResult | null;
  light: TerrainSun | null;
  loading: boolean;
  onTime: (at: Date) => void;
}) {
  const { t } = useUi();
  const riseDelay = light ? minutesBetween(light.firstLight, times.sunrise) : 0;
  const setDelay = light ? minutesBetween(times.sunset, light.lastLight) : 0;
  return (
    <section className="card" aria-labelledby="horizon-title">
      <header className="card-header">
        <h2 id="horizon-title">
          <Mountain size={16} aria-hidden="true" />
          {t.horizon}
        </h2>
        {loading && <Spinner size={15} />}
      </header>
      {!horizon || !light ? (
        <p className="muted small-note">{t.readingTerrain}</p>
      ) : !light.firstLight && !light.minutes ? (
        <p className="muted">{t.noDirectSun}</p>
      ) : (
        <>
          <div className="rows">
            <Row
              label={t.firstLight}
              value={clock(light.firstLight, tz)}
              detail={riseDelay > 0 ? fill(t.afterSunrise, { minutes: riseDelay }) : t.withSunrise}
              onSelect={light.firstLight ? () => onTime(light.firstLight!) : undefined}
            />
            <Row
              label={t.lastLight}
              value={clock(light.lastLight, tz)}
              detail={setDelay > 0 ? fill(t.beforeSunset, { minutes: setDelay }) : t.withSunset}
              onSelect={light.lastLight ? () => onTime(light.lastLight!) : undefined}
            />
            <Row label={t.directSun} value={duration(light.minutes)} detail={`${t.dayLength} ${duration(dayLength(times))}`} />
          </div>
          <div className="charts">
            <HorizonChart horizon={horizon} point={point} date={date} tz={tz} side="rise" at={at} edge={light.firstLight} />
            <HorizonChart horizon={horizon} point={point} date={date} tz={tz} side="set" at={at} edge={light.lastLight} />
          </div>
          <p className="small-note muted">{t.terrainNote}</p>
        </>
      )}
    </section>
  );
}

export function MoonCard({ point, date, tz }: { point: Point; date: string; tz: string }) {
  const { t } = useUi();
  const moon = useMemo(() => moonDay(point, date, tz), [point.lat, point.lng, date, tz]);
  const phase = t.phases[Math.round(moon.light.phase * 8) % 8];
  return (
    <section className="card moon" aria-labelledby="moon-title">
      <header className="card-header">
        <h2 id="moon-title">
          <Moon size={16} aria-hidden="true" />
          {t.moon}
        </h2>
        <span className="muted">
          {phase} · {fill(t.lit, { percent: Math.round(moon.light.fraction * 100) })}
        </span>
      </header>
      <div className="rows">
        <Row label={t.moonrise} value={clock(moon.rise, tz)} />
        <Row label={t.moonset} value={clock(moon.set, tz)} />
      </div>
    </section>
  );
}
