import { execSync } from "node:child_process";
import fs from "node:fs";

export default function globalSetup() {
  try { fs.rmSync("prisma/test.db", { force: true }); } catch { /* ignore */ }
  try { fs.rmSync("prisma/test.db-journal", { force: true }); } catch { /* ignore */ }
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
}