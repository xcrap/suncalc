import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

export const DATA_DIR = resolve(process.env.DATA_DIR || "./data");
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
export const PORT = Number(
  process.env.NODE_ENV === "production"
    ? process.env.PORT || 3992
    : process.env.DEV_API_PORT || 3041,
);
export const HOST = process.env.HOST || "127.0.0.1";
export const COOKIE = "wakasun_session";
// Phones stay signed in for a season of sunsets.
export const SESSION_DAYS = 180;
