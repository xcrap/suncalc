import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { db } from "./db";
import { currentUser, login, logout, setup, setupRequired } from "./auth";
import { createPlace, deletePlace, listPlaces, PlaceError, updatePlace } from "./places";
import { reverse, search } from "./geocode";
import { HOST, PORT } from "./config";

const production = process.env.NODE_ENV === "production";
// The map draws OpenFreeMap vector tiles, Esri imagery and AWS terrain tiles.
const tiles =
  "https://tiles.openfreemap.org https://server.arcgisonline.com https://s3.amazonaws.com";

export const app = new Hono();
app.use("*", async (c, next) => {
  await next();
  // Set after the handler so static Responses carry them too.
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  if (production)
    c.header(
      "Content-Security-Policy",
      `default-src 'self'; img-src 'self' data: blob: ${tiles}; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; worker-src 'self' blob:; connect-src 'self' ${tiles}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    );
  const path = c.req.path;
  if (path.startsWith("/api")) {
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  } else if (path.startsWith("/assets/") && c.res.status === 200)
    // Vite fingerprints asset filenames, so they never change in place.
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  else if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-cache");
});
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) => c.json({ error: "request_too_large" }, 413),
  }),
);
app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (c.req.header("x-wakasun") !== "1")
      return c.json({ error: "invalid_request" }, 403);
    const origin = c.req.header("origin");
    const allowed = new Set([new URL(c.req.url).origin]);
    if (process.env.PUBLIC_URL) allowed.add(process.env.PUBLIC_URL.replace(/\/$/, ""));
    if (c.req.header("x-forwarded-proto") === "https")
      allowed.add(`https://${c.req.header("host")}`);
    if (!production) {
      allowed.add("http://127.0.0.1:3042");
      allowed.add("http://localhost:3042");
    }
    if (origin && !allowed.has(origin))
      return c.json({ error: "invalid_origin" }, 403);
  }
  await next();
});
app.onError((err, c) => {
  if (err instanceof PlaceError)
    return c.json({ error: err.message }, err.message === "not_found" ? 404 : 400);
  if (err instanceof SyntaxError) return c.json({ error: "invalid_request" }, 400);
  if (err.message === "geocoder_unavailable" || err.name === "TimeoutError")
    return c.json({ error: "geocoder_unavailable" }, 502);
  console.error("Request failed:", err.message);
  return c.json({ error: "request_failed" }, 500);
});
async function body(c: any): Promise<Record<string, unknown>> {
  const value = await c.req.json();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SyntaxError("invalid_request");
  return value;
}

app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/auth/me", (c) =>
  c.json({ user: currentUser(c), setup_required: setupRequired() }),
);
app.post("/api/auth/setup", async (c) => setup(c, await body(c)));
app.post("/api/auth/login", async (c) => login(c, await body(c)));
app.post("/api/auth/logout", logout);

app.get("/api/geocode/search", async (c) => {
  const q = (c.req.query("q") || "").trim();
  if (q.length < 2 || q.length > 200) return c.json({ results: [] });
  return c.json({ results: await search(q, c.req.query("viewbox")) });
});
app.get("/api/geocode/reverse", async (c) => {
  const lat = Number(c.req.query("lat")),
    lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return c.json({ error: "invalid_request" }, 400);
  return c.json(await reverse(lat, lng));
});

// Saved places are private to the owner.
app.use("/api/places/*", async (c, next) => {
  if (!currentUser(c)) return c.json({ error: "unauthorized" }, 401);
  await next();
});
app.use("/api/places", async (c, next) => {
  if (!currentUser(c)) return c.json({ error: "unauthorized" }, 401);
  await next();
});
app.get("/api/places", (c) => c.json({ places: listPlaces() }));
app.post("/api/places", async (c) => c.json({ place: createPlace(await body(c)) }, 201));
app.patch("/api/places/:id", async (c) =>
  c.json({ place: updatePlace(c.req.param("id"), await body(c)) }),
);
app.delete("/api/places/:id", (c) =>
  deletePlace(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404),
);
app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

const dist = "./web/dist";
app.use("/assets/*", serveStatic({ root: dist }));
for (const file of ["favicon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "manifest.webmanifest"])
  app.get(`/${file}`, serveStatic({ root: dist }));
app.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n"));
app.get("/", serveStatic({ root: dist, path: "index.html" }));
app.get("/setup", serveStatic({ root: dist, path: "index.html" }));
app.notFound((c) => c.text("Not found", 404));

if (import.meta.main) {
  const server = Bun.serve({ hostname: HOST, port: PORT, fetch: app.fetch, idleTimeout: 30 });
  console.log(`Waka Sun is running at http://${HOST}:${server.port}/`);
  if (setupRequired()) console.log("Create the owner account with: bun run owner:setup");
  const shutdown = () => {
    server.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
