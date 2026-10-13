import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapLibre,
  Marker,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Place } from "./api";
import { dayRays, seasonRays, skyDial } from "./overlay";
import { metersPerPixel, sunAt, type DayTimes, type Point } from "./sun";
import { TERRAIN_TILES } from "./terrain";
import { useUi } from "./ui";

setWorkerUrl(workerUrl);

// OpenFreeMap: free OpenStreetMap vector tiles with no key or limits.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DIAL_PIXELS = 92;

export type View = { center: [number, number]; zoom: number };
type Props = {
  point: Point;
  onPoint: (p: Point) => void;
  date: string;
  tz: string;
  at: Date;
  times: DayTimes;
  path: { azimuth: number; altitude: number }[];
  places: Place[];
  onOpenPlace: (place: Place) => void;
  initial: View;
  onView: (view: View) => void;
  padding: { bottom: number; left: number };
  satellite: boolean;
  onReady: (map: MapLibre | null) => void;
};

function addLayers(map: MapLibre) {
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  map.addSource("terrain", {
    type: "raster-dem",
    tiles: [TERRAIN_TILES],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 14,
    attribution: '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>',
  });
  map.addLayer(
    {
      id: "hillshade",
      type: "hillshade",
      source: "terrain",
      paint: {
        "hillshade-exaggeration": 0.32,
        "hillshade-shadow-color": "#4f5747",
        "hillshade-accent-color": "#4f5747",
        "hillshade-highlight-color": "#ffffff",
      },
    },
    firstSymbol,
  );
  map.addSource("imagery", {
    type: "raster",
    tiles: [IMAGERY],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  });
  map.addLayer({ id: "imagery", type: "raster", source: "imagery", layout: { visibility: "none" } }, firstSymbol);

  const empty = { type: "FeatureCollection" as const, features: [] };
  for (const id of ["dial", "season-rays", "day-rays"]) map.addSource(id, { type: "geojson", data: empty });
  const kind: ExpressionSpecification = ["get", "kind"];
  map.addLayer({
    id: "dial-disk",
    type: "fill",
    source: "dial",
    filter: ["==", kind, "disk"],
    paint: { "fill-color": "#ffffff", "fill-opacity": 0.42 },
  });
  map.addLayer({
    id: "dial-ring",
    type: "line",
    source: "dial",
    filter: ["in", kind, ["literal", ["ring", "tick"]]],
    paint: { "line-color": "#1a1c19", "line-opacity": 0.4, "line-width": 1.1 },
  });
  map.addLayer({
    id: "season-rays",
    type: "line",
    source: "season-rays",
    layout: { "line-cap": "round" },
    paint: {
      "line-color": ["case", ["in", "summer", kind], "#e0892b", "#4f7fb3"],
      "line-width": 1.8,
      "line-opacity": 0.9,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: "day-rays-casing",
    type: "line",
    source: "day-rays",
    filter: ["!=", kind, "sun-below"],
    layout: { "line-cap": "round" },
    paint: {
      "line-color": ["case", ["==", kind, "sun"], "#3a3d38", "#ffffff"],
      "line-width": 6.5,
      "line-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "day-rays",
    type: "line",
    source: "day-rays",
    filter: ["!=", kind, "sun-below"],
    layout: { "line-cap": "round" },
    paint: {
      "line-color": ["match", kind, "sunrise", "#f0a202", "sunset", "#e2522b", "#ffd23f"],
      "line-width": 3.4,
    },
  });
  map.addLayer({
    id: "sun-below",
    type: "line",
    source: "day-rays",
    filter: ["==", kind, "sun-below"],
    paint: { "line-color": "#5c6f9e", "line-width": 2.4, "line-dasharray": [1.5, 1.5], "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "dial-path-casing",
    type: "line",
    source: "dial",
    filter: ["==", kind, "path"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": 5 },
  });
  map.addLayer({
    id: "dial-path",
    type: "line",
    source: "dial",
    filter: ["==", kind, "path"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#f0a202", "line-width": 2.6 },
  });
  map.addLayer({
    id: "dial-north",
    type: "line",
    source: "dial",
    filter: ["==", kind, "north"],
    paint: { "line-color": "#b0392c", "line-width": 2.2 },
  });
  map.addLayer({
    id: "dial-sun",
    type: "circle",
    source: "dial",
    filter: ["==", kind, "sun"],
    paint: {
      "circle-radius": 7.5,
      "circle-color": "#ffd23f",
      "circle-stroke-color": "#3a3d38",
      "circle-stroke-width": 1.6,
    },
  });
}

function rayLength(map: MapLibre, lat: number) {
  const canvas = map.getCanvas();
  const diagonal = Math.hypot(canvas.clientWidth, canvas.clientHeight);
  return Math.max(25_000, Math.min(400_000, diagonal * 1.2 * metersPerPixel(lat, map.getZoom())));
}

export function SunMap(props: Props) {
  const { t } = useUi();
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(props.initial.zoom);
  const [length, setLength] = useState(25_000);
  const pin = useRef<Marker | null>(null);
  const mapRef = useRef<MapLibre | null>(null);

  useEffect(() => {
    const map = new MapLibre({
      container: container.current!,
      style: STYLE,
      center: props.initial.center,
      zoom: props.initial.zoom,
      attributionControl: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    props.onReady(map);
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.on("style.load", () => {
      addLayers(map);
      setReady(true);
    });
    map.on("click", (event) => latest.current.onPoint({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
    let frame = 0;
    // The dial keeps its size on screen, so it follows every zoom frame.
    map.on("zoom", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setZoom(map.getZoom()));
    });
    map.on("moveend", () => {
      const c = map.getCenter();
      setLength(rayLength(map, c.lat));
      latest.current.onView({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });
    const element = document.createElement("div");
    element.className = "pin";
    element.innerHTML = "<span></span>";
    const marker = new Marker({ element, draggable: true, anchor: "center" })
      .setLngLat([props.point.lng, props.point.lat])
      .addTo(map);
    let dragFrame = 0;
    marker.on("drag", () => {
      cancelAnimationFrame(dragFrame);
      dragFrame = requestAnimationFrame(() => {
        const at = marker.getLngLat();
        latest.current.onPoint({ lat: at.lat, lng: at.lng });
      });
    });
    pin.current = marker;
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(dragFrame);
      mapRef.current = null;
      props.onReady(null);
      map.remove();
    };
  }, []);

  const map = mapRef.current;
  const { point, date, tz, at, times, path } = props;

  useEffect(() => {
    pin.current?.setLngLat([point.lng, point.lat]);
  }, [point.lat, point.lng]);

  useEffect(() => {
    if (!ready || !map) return;
    (map.getSource("season-rays") as GeoJSONSource).setData(seasonRays(point, date, tz, length));
  }, [ready, point.lat, point.lng, date, tz, length]);

  useEffect(() => {
    if (!ready || !map) return;
    (map.getSource("day-rays") as GeoJSONSource).setData(dayRays(point, times.sunrise, times.sunset, at, length));
  }, [ready, point.lat, point.lng, times, at.getTime(), length]);

  useEffect(() => {
    if (!ready || !map) return;
    const radius = DIAL_PIXELS * metersPerPixel(point.lat, zoom);
    (map.getSource("dial") as GeoJSONSource).setData(skyDial(point, path, sunAt(point, at), radius));
  }, [ready, point.lat, point.lng, path, at.getTime(), zoom]);

  useEffect(() => {
    if (!ready || !map) return;
    map.setLayoutProperty("imagery", "visibility", props.satellite ? "visible" : "none");
    map.setLayoutProperty("hillshade", "visibility", props.satellite ? "none" : "visible");
    map.setPaintProperty("dial-disk", "fill-opacity", props.satellite ? 0.16 : 0.42);
  }, [ready, props.satellite]);

  useEffect(() => {
    map?.easeTo({ padding: { top: 0, right: 0, ...props.padding }, duration: 250 });
  }, [map, props.padding.bottom, props.padding.left]);

  // Saved places sit on the map as small bookmarks.
  useEffect(() => {
    if (!map) return;
    const markers: Marker[] = [];
    for (const place of props.places) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "place-marker";
      element.title = place.name;
      element.setAttribute("aria-label", t.openPlace.replace("{name}", place.name));
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        latest.current.onOpenPlace(place);
      });
      markers.push(new Marker({ element, anchor: "center" }).setLngLat([place.lng, place.lat]).addTo(map));
    }
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [map, props.places, t]);

  return <div ref={container} className="map" />;
}
