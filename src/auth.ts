import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { db, setupFile } from "./db";
import { COOKIE, SESSION_DAYS } from "./config";

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function secureEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function currentUser(c: Context) {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  return db
    .query(
      "SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    )
    .get(digest(token), Date.now()) as { id: number; username: string } | null;
}
export function setupRequired() {
  return !db.query("SELECT id FROM users LIMIT 1").get();
}
function session(c: Context, userId: number) {
  const token = randomBytes(32).toString("base64url");
  db.query("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
  db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)",
  ).run(digest(token), userId, Date.now() + SESSION_DAYS * 86400_000);
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure:
      new URL(c.req.url).protocol === "https:" ||
      c.req.header("x-forwarded-proto") === "https",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}
export async function setup(c: Context, body: Record<string, unknown>) {
  if (!setupRequired()) return c.json({ error: "setup_complete" }, 409);
  let expected = "";
  try {
    expected = readFileSync(setupFile, "utf8").trim();
  } catch {}
  if (
    !expected ||
    typeof body.token !== "string" ||
    !secureEqual(body.token, expected)
  )
    return c.json({ error: "invalid_setup_token" }, 403);
  if (
    typeof body.username !== "string" ||
    !/^[\p{L}\p{N}_.@-]{3,80}$/u.test(body.username.trim()) ||
    typeof body.password !== "string" ||
    body.password.length < 10 ||
    body.password.length > 256
  )
    return c.json({ error: "invalid_credentials" }, 400);
  const hash = await Bun.password.hash(body.password, { algorithm: "argon2id" });
  const username = body.username.trim();
  const created = db
    .query("INSERT OR IGNORE INTO users(id,username,password_hash) VALUES (1,?,?)")
    .run(username, hash);
  if (!created.changes) return c.json({ error: "setup_complete" }, 409);
  try {
    unlinkSync(setupFile);
  } catch {}
  session(c, 1);
  return c.json({ user: { id: 1, username } });
}
const attempts: number[] = [];
export async function login(c: Context, body: Record<string, unknown>) {
  while (attempts.length && attempts[0] < Date.now() - 60_000) attempts.shift();
  if (attempts.length >= 15) return c.json({ error: "too_many_attempts" }, 429);
  attempts.push(Date.now());
  if (
    typeof body.username !== "string" ||
    typeof body.password !== "string" ||
    body.password.length > 256
  )
    return c.json({ error: "login_failed" }, 401);
  const user = db
    .query("SELECT * FROM users WHERE username=? COLLATE NOCASE")
    .get(body.username.trim()) as {
    id: number;
    username: string;
    password_hash: string;
  } | null;
  if (!user || !(await Bun.password.verify(body.password, user.password_hash)))
    return c.json({ error: "login_failed" }, 401);
  session(c, user.id);
  return c.json({ user: { id: user.id, username: user.username } });
}
export function logout(c: Context) {
  const token = getCookie(c, COOKIE);
  if (token) db.query("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
}
