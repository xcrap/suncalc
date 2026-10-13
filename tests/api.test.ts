import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Never touch the real ./data: every run gets its own folder.
const dir = mkdtempSync(join(tmpdir(), "wakasun-test-"));
process.env.DATA_DIR = dir;
const { app } = await import("../src/index");
const { db } = await import("../src/db");

const base = "http://localhost:3041";
let cookie = "";
async function call(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const response = await app.request(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-WakaSun": "1",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = response.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: response.status, data: (await response.json().catch(() => null)) as any };
}

beforeAll(() => {
  cookie = "";
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("owner setup needs the one-time token", async () => {
  const me = await call("/api/auth/me");
  expect(me.data).toEqual({ user: null, setup_required: true });
  const wrong = await call("/api/auth/setup", "POST", { token: "nope", username: "owner", password: "long enough pw" });
  expect(wrong.status).toBe(403);
  const token = readFileSync(join(dir, "setup-token"), "utf8").trim();
  const weak = await call("/api/auth/setup", "POST", { token, username: "owner", password: "short" });
  expect(weak.data.error).toBe("invalid_credentials");
  const ok = await call("/api/auth/setup", "POST", { token, username: "owner", password: "long enough pw" });
  expect(ok.status).toBe(200);
  expect(cookie).toContain("wakasun_session=");
  const again = await call("/api/auth/setup", "POST", { token, username: "other", password: "long enough pw" });
  expect(again.status).toBe(409);
});

test("places are private to the owner", async () => {
  const saved = cookie;
  cookie = "";
  expect((await call("/api/places")).status).toBe(401);
  expect((await call("/api/places", "POST", { name: "x", lat: 1, lng: 1 })).status).toBe(401);
  cookie = saved;
});

test("writes need the app header and a known origin", async () => {
  const noHeader = await app.request(`${base}/api/places`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "x", lat: 1, lng: 1 }),
  });
  expect(noHeader.status).toBe(403);
  const foreign = await call("/api/places", "POST", { name: "x", lat: 1, lng: 1 }, { Origin: "https://evil.example" });
  expect(foreign.data.error).toBe("invalid_origin");
});

test("saving, editing and deleting a place", async () => {
  const created = await call("/api/places", "POST", {
    name: "  Vista do Rei  ",
    lat: 37.8386,
    lng: -25.7975,
    zoom: 14.5,
    date: "2026-06-21",
    note: "Summer sunset over the lagoons",
  });
  expect(created.status).toBe(201);
  const place = created.data.place;
  expect(place).toMatchObject({ name: "Vista do Rei", lat: 37.8386, date: "2026-06-21", zoom: 14.5 });

  const renamed = await call(`/api/places/${place.id}`, "PATCH", { name: "Miradouro da Vista do Rei" });
  // Only the sent field changes.
  expect(renamed.data.place).toMatchObject({ name: "Miradouro da Vista do Rei", date: "2026-06-21" });
  const cleared = await call(`/api/places/${place.id}`, "PATCH", { date: null, note: "" });
  expect(cleared.data.place).toMatchObject({ date: null, note: null });

  expect((await call("/api/places")).data.places).toHaveLength(1);
  expect((await call(`/api/places/${place.id}`, "DELETE")).status).toBe(200);
  expect((await call(`/api/places/${place.id}`, "DELETE")).status).toBe(404);
  expect((await call("/api/places")).data.places).toHaveLength(0);
});

test("invalid places are refused", async () => {
  for (const body of [
    { name: "", lat: 1, lng: 1 },
    { name: "x", lat: 91, lng: 1 },
    { name: "x", lat: 1, lng: "1" },
    { name: "x", lat: 1, lng: 1, date: "21/06/2026" },
    { name: "x".repeat(121), lat: 1, lng: 1 },
  ])
    expect((await call("/api/places", "POST", body)).data.error).toBe("invalid_place");
  expect((await call("/api/places/missing", "PATCH", { name: "x" })).status).toBe(404);
});

test("sign out ends the session and sign in restores it", async () => {
  await call("/api/auth/logout", "POST");
  cookie = "";
  expect((await call("/api/places")).status).toBe(401);
  expect((await call("/api/auth/login", "POST", { username: "OWNER", password: "wrong password" })).status).toBe(401);
  const ok = await call("/api/auth/login", "POST", { username: "OWNER", password: "long enough pw" });
  expect(ok.data.user.username).toBe("owner");
  expect((await call("/api/places")).status).toBe(200);
});

test("security headers on pages and API", async () => {
  const response = await app.request(`${base}/api/health`);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
});
