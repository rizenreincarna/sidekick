import { execFileSync } from "node:child_process";

const databaseUrl = process.argv[2];
if (!databaseUrl?.startsWith("file:")) throw new Error("Usage: bun scripts/verify-marie-migration.ts file:/path/to/disposable.sqlite");
const path = databaseUrl.slice(5);
const output = execFileSync("sqlite3", [path, "PRAGMA integrity_check; PRAGMA foreign_key_check;"], { encoding: "utf8" }).trim();
if (output !== "ok") throw new Error(`Migration verification failed:\n${output}`);
process.stdout.write("Marie migration integrity and foreign-key verification passed.\n");
