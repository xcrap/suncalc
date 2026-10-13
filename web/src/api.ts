export async function api<T = any>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "X-WakaSun": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  // Proxies and body limits can answer with non-JSON errors.
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "request_failed");
  return data;
}

export type User = { id: number; username: string };
export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number | null;
  date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};
export type PlaceInput = Pick<Place, "name" | "lat" | "lng" | "zoom" | "date" | "note">;
export type SearchResult = { name: string; area: string; lat: number; lng: number };
