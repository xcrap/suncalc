import { Database } from "bun:sqlite";
import { chmodSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DATA_DIR } from "./config";

const file = join(DATA_DIR, "sun.sqlite");
export const db = new Database(file, { create: true });
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
);
chmodSync(file, 0o600);
db.exec(
  "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)",
);
for (const name of readdirSync(join(import.meta.dir, "migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort()) {
  if (db.query("SELECT name FROM migrations WHERE name=?").get(name)) continue;
  db.transaction(() => {
    db.exec(readFileSync(join(import.meta.dir, "migrations", name), "utf8"));
    db.query("INSERT INTO migrations (name) VALUES (?)").run(name);
  })();
}
// The first owner is created through a one-time link printed by `bun run owner:setup`.
export const setupFile = join(DATA_DIR, "setup-token");
if (!db.query("SELECT id FROM users LIMIT 1").get() && !existsSync(setupFile))
  writeFileSync(setupFile, randomBytes(32).toString("base64url"), {
    mode: 0o600,
  });

if (import.meta.main) console.log("Database is ready.");
