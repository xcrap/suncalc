import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createRoot } from "react-dom/client";
import type { Map as MapLibre } from "maplibre-gl";
import { Compass, Layers, LocateFixed, Minus, Plus } from "lucide-react";
import "@fontsource-variable/instrument-sans";
// The base stylesheet precedes component styles in the cascade.
import "./style.css";
import { api, type Place, type PlaceInput, type User } from "./api";
import { minutesClock } from "./format";
import { terrainSun, useHorizon } from "./horizon";
import { en } from "./i18n";
import { SunMap, type View } from "./map";
import { DateControls, HorizonCard, LocationCard, MoonCard, SunCard, SunTiles, TimeSlider } from "./panel";
import { PlaceDialog, PlacesCard, SignInDialog } from "./places";
import { Search } from "./search";
import { dayTimes, localDate, localMinutes, shiftDate, sunPath, timeZoneAt, zonedInstant, type Point } from "./sun";
import { Logo, message, Spinner, ToastMessage, Ui, useUi, type Toast } from "./ui";

// Ponta Delgada, São Miguel.
const HOME = { lat: 37.73952, lng: -25.66872, zoom: 11 };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readStart() {
  const q = new URLSearchParams(location.search);
  let saved: { lat?: number; lng?: number; zoom?: number } = {};
  try {
    saved = JSON.parse(localStorage.getItem("wakasun-last") || "{}");
  } catch {}
  const lat = Number(q.get("lat") ?? saved.lat),
    lng = Number(q.get("lng") ?? saved.lng),
    zoom = Number(q.get("z") ?? saved.zoom);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180;
  const point = valid ? { lat, lng } : { lat: HOME.lat, lng: HOME.lng };
  const date = q.get("date");
  const time = q.get("t")?.match(/^(\d{2}):?(\d{2})$/);
  return {
    point,
    zoom: Number.isFinite(zoom) && zoom >= 1 && zoom <= 20 ? zoom : HOME.zoom,
    date: date && DATE.test(date) ? date : null,
    minutes: time ? Math.min(1439, Number(time[1]) * 60 + Number(time[2])) : null,
  };
}

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const change = () => setMatches(list.matches);
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, [query]);
  return matches;
}

function App() {
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <Ui.Provider value={{ t: en, notify: setToast }}>
      <a className="skip-link" href="#planner">
        {en.skip}
      </a>
      <Planner />
      {toast && <ToastMessage toast={toast} onClose={() => setToast(null)} />}
    </Ui.Provider>
  );
}

type Sheet = { height: number; dragging: boolean };

function Planner() {
  const { t, notify } = useUi();
  const start = useMemo(readStart, []);
  const mobile = useMedia("(max-width: 760px)");
  const [map, setMap] = useState<MapLibre | null>(null);
  const [point, setPoint] = useState<Point>(start.point);
  const [zoom, setZoom] = useState(start.zoom);
  const [now, setNow] = useState(() => new Date());
  const [date, setDate] = useState<string | null>(start.date);
  const [minutes, setMinutes] = useState<number | null>(start.minutes);
  const [satellite, setSatellite] = useState(() => {
    try {
      return localStorage.getItem("wakasun-satellite") === "1";
    } catch {
      return false;
    }
  });
  const [known, setKnown] = useState<{ lat: number; lng: number; name: string; area?: string } | null>(null);
  const [label, setLabel] = useState<{ key: string; name: string | null; area: string | null } | null>(null);
  const [locating, setLocating] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState(() =>
    location.pathname === "/setup" ? new URLSearchParams(location.search).get("token") : null,
  );
  const [dialog, setDialog] = useState<
    { kind: "sign-in" } | { kind: "place"; initial: PlaceInput; editing: Place | null } | null
  >(setupToken ? { kind: "sign-in" } : null);

  const tz = useMemo(() => timeZoneAt(point), [point.lat, point.lng]);
  const today = localDate(now, tz);
  const day = date ?? today;
  const live = minutes === null && day === today;
  const sliderMinutes = minutes ?? localMinutes(now, tz);
  const at = useMemo(
    () => (live ? now : zonedInstant(day, sliderMinutes, tz)),
    [live, now, day, sliderMinutes, tz],
  );
  const times = useMemo(() => dayTimes(point, day, tz), [point.lat, point.lng, day, tz]);
  const previous = useMemo(() => dayTimes(point, shiftDate(day, -1), tz), [point.lat, point.lng, day, tz]);
  const path = useMemo(() => sunPath(point, day, tz), [point.lat, point.lng, day, tz]);
  const { horizon, loading: horizonLoading } = useHorizon(point);
  const light = useMemo(
    () => (horizon ? terrainSun(horizon, point, day, tz) : null),
    [horizon, point.lat, point.lng, day, tz],
  );

  // The clock keeps "now" fresh while the page is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 20_000);
    const visible = () => !document.hidden && setNow(new Date());
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  // Keep the address bar shareable and remember the last spot.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = new URLSearchParams();
      q.set("lat", point.lat.toFixed(5));
      q.set("lng", point.lng.toFixed(5));
      q.set("z", zoom.toFixed(1));
      if (date) q.set("date", date);
      if (minutes !== null) q.set("t", minutesClock(minutes).replace(":", ""));
      if (location.pathname !== "/setup") history.replaceState(null, "", `/?${q}`);
      try {
        localStorage.setItem("wakasun-last", JSON.stringify({ lat: point.lat, lng: point.lng, zoom }));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [point.lat, point.lng, zoom, date, minutes]);

  // Name the spot once the pin settles.
  const labelKey = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
  const isKnown = known && known.lat === point.lat && known.lng === point.lng;
  useEffect(() => {
    if (isKnown || label?.key === labelKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await api<{ name: string | null; area: string | null }>(
          `/api/geocode/reverse?lat=${point.lat}&lng=${point.lng}`,
          "GET",
          undefined,
          controller.signal,
        );
        setLabel({ key: labelKey, ...result });
      } catch {
        if (!controller.signal.aborted) setLabel({ key: labelKey, name: null, area: null });
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [labelKey, isKnown]);
  const name = isKnown ? known!.name : label?.key === labelKey ? label.name : null;
  const area = isKnown ? known!.area || null : label?.key === labelKey ? label.area : null;

  // Owner session and saved places.
  useEffect(() => {
    api<{ user: User | null; setup_required: boolean }>("/api/auth/me")
      .then((me) => {
        setUser(me.user);
        setSetupRequired(me.setup_required);
        // A used setup link falls back to the ordinary sign-in.
        if (!me.setup_required && setupToken) {
          setSetupToken(null);
          history.replaceState(null, "", "/");
          if (me.user) setDialog(null);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!user) {
      setPlaces([]);
      return;
    }
    api<{ places: Place[] }>("/api/places")
      .then((data) => setPlaces(data.places))
      .catch((e) => {
        if ((e as Error).message === "unauthorized") setUser(null);
        else notify({ message: message(e, t), error: true });
      });
  }, [user?.id]);

  const movePoint = useCallback((p: Point) => {
    setPoint({ lat: p.lat, lng: p.lng });
    setActiveId(null);
  }, []);
  const flyTo = (p: Point, targetZoom?: number) => {
    map?.flyTo({ center: [p.lng, p.lat], zoom: targetZoom ?? Math.max(map.getZoom(), 13), essential: true });
  };
  const freezeTime = () => {
    if (minutes === null) setMinutes(Math.round(localMinutes(now, tz)));
  };
  const changeDate = (value: string) => {
    freezeTime();
    setDate(value === today ? null : value);
  };
  const setTime = (moment: Date) => setMinutes(Math.round(localMinutes(moment, tz)) % 1440);
  const openPlace = (place: Place) => {
    setPoint({ lat: place.lat, lng: place.lng });
    setKnown({ lat: place.lat, lng: place.lng, name: place.name });
    setActiveId(place.id);
    if (place.date) changeDate(place.date);
    flyTo(place, place.zoom ?? undefined);
    if (mobile) setSheet((s) => ({ ...s, height: peek }));
  };
  const savePlace = () => {
    if (!user) {
      if (!setupRequired) setDialog({ kind: "sign-in" });
      else notify({ message: t.setupNeeded });
      return;
    }
    setDialog({
      kind: "place",
      editing: null,
      initial: { name: name || "", lat: point.lat, lng: point.lng, zoom: map?.getZoom() ?? zoom, date: day, note: null },
    });
  };
  const deletePlace = async (place: Place) => {
    try {
      await api(`/api/places/${place.id}`, "DELETE");
      setPlaces((list) => list.filter((p) => p.id !== place.id));
      notify({
        message: t.placeDeleted,
        label: t.undo,
        action: async () => {
          try {
            const { name, lat, lng, zoom, date, note } = place;
            const restored = await api<{ place: Place }>("/api/places", "POST", { name, lat, lng, zoom, date, note });
            setPlaces((list) => [restored.place, ...list]);
          } catch (e) {
            notify({ message: message(e, t), error: true });
          }
        },
      });
    } catch (e) {
      notify({ message: message(e, t), error: true });
    }
  };
  const signOut = async () => {
    await api("/api/auth/logout", "POST").catch(() => {});
    setUser(null);
  };
  const locate = () => {
    if (!navigator.geolocation) return notify({ message: t.locationUnavailable, error: true });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const p = { lat: position.coords.latitude, lng: position.coords.longitude };
        movePoint(p);
        flyTo(p, Math.max(map?.getZoom() ?? 14, 14));
      },
      () => {
        setLocating(false);
        notify({ message: t.locationUnavailable, error: true });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      notify({ message: t.linkCopied });
    } catch {
      notify({ message: t.errors.request_failed, error: true });
    }
  };
  const viewbox = () => {
    const b = map?.getBounds();
    return b ? [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].map((n) => n.toFixed(4)).join(",") : undefined;
  };
  const onView = useCallback((view: View) => setZoom(view.zoom), []);

  // Mobile: the planner is a bottom sheet over a full-screen map.
  const [viewport, setViewport] = useState(() => innerHeight);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    // The keyboard shrinks the viewport while typing; the sheet keeps its size.
    const typing = () =>
      document.activeElement?.matches('input:not([type="range"], [type="date"]), textarea') ?? false;
    const resize = () => {
      if (!typing()) setViewport(innerHeight);
    };
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  const peek = Math.round(Math.min(380, viewport * 0.46));
  const full = viewport - 74;
  const [sheet, setSheet] = useState<Sheet>({ height: 0, dragging: false });
  const sheetHeight = sheet.height || peek;
  const drag = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, height: sheetHeight, moved: false };
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const delta = drag.current.y - event.clientY;
    if (Math.abs(delta) > 4) drag.current.moved = true;
    if (drag.current.moved)
      setSheet({ height: Math.max(120, Math.min(full, drag.current.height + delta)), dragging: true });
  };
  const onHandleUp = () => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (!state.moved) {
      setSheet({ height: sheetHeight > peek + 20 ? peek : full, dragging: false });
      return;
    }
    const target = [140, peek, full].reduce((best, h) =>
      Math.abs(h - sheetHeight) < Math.abs(best - sheetHeight) ? h : best,
    );
    setSheet({ height: target, dragging: false });
  };
  const expanded = sheetHeight > peek + 20;

  const search = (
    <Search
      viewbox={viewbox}
      onActive={setSearching}
      onPick={(result) => {
        movePoint(result);
        if ("name" in result && result.name) setKnown({ lat: result.lat, lng: result.lng, name: result.name, area: (result as { area?: string }).area });
        flyTo(result, Math.max(map?.getZoom() ?? 13, 13));
        if (mobile) setSheet((s) => ({ ...s, height: peek }));
      }}
    />
  );

  return (
    <div className={`app ${mobile ? "is-mobile" : ""} ${mobile && searching ? "is-searching" : ""}`} style={{ "--sheet": `${mobile ? sheetHeight : 0}px` } as CSSProperties}>
      <aside
        id="planner"
        className={`panel ${sheet.dragging ? "dragging" : ""}`}
      >
        {mobile && (
          <button
            className="sheet-handle"
            aria-label={expanded ? t.collapse : t.expand}
            aria-expanded={expanded}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            <span />
          </button>
        )}
        {!mobile && (
          <header className="panel-header">
            <Logo />
          </header>
        )}
        <div className="panel-body">
          {!mobile && search}
          <LocationCard
            point={point}
            name={name}
            area={area}
            elevation={horizon ? horizon.elevation : null}
            tz={tz}
            at={at}
            onCopy={copyLink}
            onSave={savePlace}
          />
          <SunTiles point={point} tz={tz} times={times} light={light} onTime={setTime} />
          <DateControls date={day} today={today} point={point} tz={tz} onDate={changeDate} />
          <TimeSlider
            minutes={sliderMinutes}
            live={live}
            path={path}
            tz={tz}
            at={at}
            onMinutes={setMinutes}
            onNow={() => {
              setDate(null);
              setMinutes(null);
            }}
          />
          <ul className="legend" aria-label={t.legend}>
            <li className="legend-sunrise">{t.legendSunrise}</li>
            <li className="legend-sunset">{t.legendSunset}</li>
            <li className="legend-sun">{t.legendSun}</li>
            <li className="legend-seasons">{t.legendSeasons}</li>
          </ul>
          <SunCard point={point} tz={tz} times={times} previous={previous} at={at} onTime={setTime} />
          <HorizonCard
            point={point}
            date={day}
            tz={tz}
            times={times}
            at={at}
            horizon={horizon}
            light={light}
            loading={horizonLoading}
            onTime={setTime}
          />
          <MoonCard point={point} date={day} tz={tz} />
          <PlacesCard
            user={user}
            setupRequired={setupRequired}
            places={places}
            activeId={activeId}
            onSignIn={() => setDialog({ kind: "sign-in" })}
            onSignOut={signOut}
            onSave={savePlace}
            onOpen={openPlace}
            onEdit={(place) =>
              setDialog({
                kind: "place",
                editing: place,
                initial: { name: place.name, lat: place.lat, lng: place.lng, zoom: place.zoom, date: place.date, note: place.note },
              })
            }
            onDelete={deletePlace}
          />
          {mobile && (
            <footer className="panel-footer">
              <Logo />
            </footer>
          )}
        </div>
      </aside>
      <main className="map-shell">
        <SunMap
          point={point}
          onPoint={movePoint}
          date={day}
          tz={tz}
          at={at}
          times={times}
          path={path}
          places={places}
          onOpenPlace={openPlace}
          initial={{ center: [start.point.lng, start.point.lat], zoom: start.zoom }}
          onView={onView}
          padding={{ bottom: mobile ? peek : 0, left: 0 }}
          satellite={satellite}
          onReady={setMap}
        />
        {mobile && <div className="map-search">{search}</div>}
        <MapTools
          map={map}
          satellite={satellite}
          locating={locating}
          onSatellite={() => {
            setSatellite((value) => {
              try {
                localStorage.setItem("wakasun-satellite", value ? "0" : "1");
              } catch {}
              return !value;
            });
          }}
          onLocate={locate}
        />
      </main>
      {dialog?.kind === "sign-in" && (
        <SignInDialog
          setupToken={setupToken}
          onClose={() => {
            setDialog(null);
            if (setupToken) history.replaceState(null, "", "/");
            setSetupToken(null);
          }}
          onSignedIn={(signedIn) => {
            setUser(signedIn);
            setSetupRequired(false);
            setDialog(null);
            if (setupToken) history.replaceState(null, "", "/");
            setSetupToken(null);
          }}
        />
      )}
      {dialog?.kind === "place" && (
        <PlaceDialog
          initial={dialog.initial}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onSaved={(place) => {
            setPlaces((list) => [place, ...list.filter((p) => p.id !== place.id)]);
            setActiveId(place.id);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function MapTools({
  map,
  satellite,
  locating,
  onSatellite,
  onLocate,
}: {
  map: MapLibre | null;
  satellite: boolean;
  locating: boolean;
  onSatellite: () => void;
  onLocate: () => void;
}) {
  const { t } = useUi();
  const [bearing, setBearing] = useState(0);
  useEffect(() => {
    if (!map) return;
    const rotate = () => setBearing(map.getBearing());
    map.on("rotate", rotate);
    return () => {
      map.off("rotate", rotate);
    };
  }, [map]);
  return (
    <div className="map-tools">
      <div className="tool-group zoom-tools">
        <button className="tool" aria-label={t.zoomIn} title={t.zoomIn} onClick={() => map?.zoomIn()}>
          <Plus size={18} />
        </button>
        <button className="tool" aria-label={t.zoomOut} title={t.zoomOut} onClick={() => map?.zoomOut()}>
          <Minus size={18} />
        </button>
      </div>
      {Math.abs(bearing) > 0.5 && (
        <button
          className="tool"
          aria-label={t.resetNorth}
          title={t.resetNorth}
          onClick={() => map?.easeTo({ bearing: 0 })}
        >
          <Compass size={18} style={{ transform: `rotate(${-bearing - 45}deg)` }} />
        </button>
      )}
      <button
        className="tool"
        aria-label={t.satellite}
        title={satellite ? t.mapStyle : t.satellite}
        aria-pressed={satellite}
        onClick={onSatellite}
      >
        <Layers size={18} />
      </button>
      <button className="tool" aria-label={t.locate} title={t.locate} onClick={onLocate} disabled={locating}>
        {locating ? <Spinner size={18} /> : <LocateFixed size={18} />}
      </button>
    </div>
  );
}

// Reuse the root when Vite reloads this entry module during UI development.
const root = import.meta.hot?.data.root || createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App />);
