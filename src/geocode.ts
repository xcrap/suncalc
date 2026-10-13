// Place search and names through OpenStreetMap's Nominatim. Its usage policy
// asks for an identifying User-Agent, at most one request per second and
// cached results, so the browser never calls it directly.
const ENDPOINT = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const AGENT = "WakaSun/1.0 (personal sunrise and sunset planner)";
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 7 * 86400_000;
let queue: Promise<unknown> = Promise.resolve();
let last = 0;

async function fetchJson(url: string) {
  const key = url;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const run = queue.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await Bun.sleep(wait);
    last = Date.now();
    const response = await fetch(url, {
      headers: { "User-Agent": AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("geocoder_unavailable");
    return response.json();
  });
  // A failed lookup must not stall the requests queued behind it.
  queue = run.catch(() => {});
  const value = await run;
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
  return value;
}

type Address = Record<string, string | undefined>;
// A village or parish says more about a sunset spot than a street name.
const LOCAL = ["hamlet", "village", "city_district", "suburb", "neighbourhood", "quarter", "town", "city", "road"];
// Parishes (freguesias) arrive as city_district inside a municipality.
const AREA = ["village", "city_district", "town", "city", "municipality", "county"];
function describe(name: string | undefined, address: Address = {}) {
  const parts: string[] = [];
  const add = (value: string | undefined) => {
    if (value && !parts.includes(value)) parts.push(value);
  };
  add(name || LOCAL.map((k) => address[k]).find(Boolean));
  add(AREA.map((k) => address[k]).find((v) => v && !parts.includes(v)));
  add(address.island || address.archipelago || address.country);
  return parts;
}
const language = (lang: string | undefined) => (lang === "pt" ? "pt-PT,pt,en" : "en,pt");

export async function search(query: string, lang?: string, viewbox?: string) {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: "6",
    addressdetails: "1",
    "accept-language": language(lang),
  });
  if (viewbox && /^-?[\d.]+(,-?[\d.]+){3}$/.test(viewbox)) params.set("viewbox", viewbox);
  const rows = (await fetchJson(`${ENDPOINT}/search?${params}`)) as {
    lat: string;
    lon: string;
    name?: string;
    display_name: string;
    type?: string;
    address?: Address;
  }[];
  return rows.map((row) => {
    const parts = describe(row.name, row.address);
    return {
      name: parts[0] || row.display_name.split(",")[0],
      area: parts.slice(1).join(", "),
      lat: Number(row.lat),
      lng: Number(row.lon),
    };
  });
}

export async function reverse(lat: number, lng: number, lang?: string) {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: lat.toFixed(4),
    lon: lng.toFixed(4),
    // Building level, so named viewpoints, beaches and peaks come back.
    zoom: "18",
    addressdetails: "1",
    "accept-language": language(lang),
  });
  const row = (await fetchJson(`${ENDPOINT}/reverse?${params}`)) as {
    name?: string;
    category?: string;
    address?: Address;
    error?: string;
  };
  if (row.error) return { name: null, area: null };
  const named = row.category && !["highway", "building", "place", "landuse", "boundary"].includes(row.category);
  const parts = describe(named ? row.name : undefined, row.address);
  return { name: parts[0] || null, area: parts.slice(1).join(", ") || null };
}
