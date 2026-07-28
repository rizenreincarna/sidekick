import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { computeMarieDryRun } from "../src/lib/marie-dry-run";
import { db } from "../src/lib/db";

const output = resolve(process.argv[2] || "marie-dry-run-report.json");

try {
  const report = await computeMarieDryRun();
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`Redacted DRY_RUN report written to ${output}`);
} finally {
  await db.$disconnect();
}
