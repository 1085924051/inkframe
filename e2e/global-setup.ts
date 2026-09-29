import { execSync } from "node:child_process";
import fs from "node:fs";

export default function globalSetup() {
  try { fs.rmSync("prisma/e2e.db", { force: true }); } catch { /* ignore */ }
  try { fs.rmSync("prisma/e2e.db-journal", { force: true }); } catch { /* ignore */ }
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./e2e.db" },
    stdio: "pipe",
  });
}