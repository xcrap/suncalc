import { readFileSync } from "node:fs";
import { setupFile } from "../src/db";
import { setupRequired } from "../src/auth";
if (!setupRequired()) {
  console.log("The owner account already exists. Sign in from the Places panel.");
  process.exit(0);
}
const token = readFileSync(setupFile, "utf8").trim();
const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3992}`;
console.log(`Create the owner account: ${base}/setup?token=${token}`);
