import { randomUUID } from "node:crypto";
import { db } from "./db";

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number | null;
  date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
export class PlaceError extends Error {}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function text(value: unknown, max: number, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new PlaceError("invalid_place");
    return null;
  }
  if (typeof value !== "string") throw new PlaceError("invalid_place");
  const trimmed = value.trim();
  if (required && !trimmed) throw new PlaceError("invalid_place");
  if (trimmed.length > max) throw new PlaceError("invalid_place");
  return trimmed || null;
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new PlaceError("invalid_place");
  return value;
}
// Validates only the fields present, so a rename never touches the saved date.
function fields(input: Record<string, unknown>, creating: boolean) {
  const out: Partial<Omit<Place, "id" | "created_at" | "updated_at">> = {};
  if (creating || "name" in input) out.name = text(input.name, 120, true)!;
  if (creating || "lat" in input) out.lat = number(input.lat, -90, 90);
  if (creating || "lng" in input) out.lng = number(input.lng, -180, 180);
  if ("zoom" in input)
    out.zoom = input.zoom === null ? null : number(input.zoom, 0, 22);
  if ("date" in input) {
    const date = text(input.date, 10);
    if (date !== null && !DATE.test(date)) throw new PlaceError("invalid_place");
    out.date = date;
  }
  if ("note" in input) out.note = text(input.note, 1000);
  return out;
}
export function listPlaces() {
  return db
    .query("SELECT * FROM places ORDER BY created_at DESC, rowid DESC")
    .all() as Place[];
}
export function getPlace(id: string) {
  return db.query("SELECT * FROM places WHERE id=?").get(id) as Place | null;
}
export function createPlace(input: Record<string, unknown>) {
  const value = fields(input, true);
  if ((db.query("SELECT COUNT(*) AS n FROM places").get() as { n: number }).n >= 2000)
    throw new PlaceError("too_many_places");
  const id = randomUUID();
  db.query(
    "INSERT INTO places(id,name,lat,lng,zoom,date,note) VALUES (?,?,?,?,?,?,?)",
  ).run(
    id,
    value.name!,
    value.lat!,
    value.lng!,
    value.zoom ?? null,
    value.date ?? null,
    value.note ?? null,
  );
  return getPlace(id)!;
}
export function updatePlace(id: string, input: Record<string, unknown>) {
  const value = fields(input, false);
  const keys = Object.keys(value);
  if (!getPlace(id)) throw new PlaceError("not_found");
  if (keys.length)
    db.query(
      `UPDATE places SET ${keys.map((k) => `${k}=?`).join(",")}, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).run(...keys.map((k) => value[k as keyof typeof value] ?? null), id);
  return getPlace(id)!;
}
export function deletePlace(id: string) {
  return db.query("DELETE FROM places WHERE id=?").run(id).changes > 0;
}
