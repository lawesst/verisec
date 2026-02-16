import "./env.js";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAuditValidator } from "./validation.js";
import { deleteAudit, insertAudit } from "./storage.js";
import type { AuditReport } from "@verisec/schema";

async function main() {
  const args = new Set(process.argv.slice(2));
  const refresh = args.has("--refresh") || args.has("--force");
  if (args.has("--all")) {
    const fixtures = await resolveAllFixtures();
    for (const filePath of fixtures) {
      await seedFile(filePath, refresh);
    }
    return;
  }

  const filePath = resolveFromArgs();
  await seedFile(filePath, refresh);
}

function resolveFromArgs() {
  const provided = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (provided) {
    return resolve(process.cwd(), provided);
  }
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = resolve(currentFile, "..");
  return resolve(currentDir, "../fixtures/sample-audit.json");
}

async function resolveAllFixtures() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = resolve(currentFile, "..");
  const fixturesDir = resolve(currentDir, "../fixtures");
  const entries = await readdir(fixturesDir);
  return entries
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => resolve(fixturesDir, name));
}

async function seedFile(filePath: string, refresh: boolean) {
  const raw = await readFile(filePath, "utf-8");
  const payload = JSON.parse(raw) as AuditReport;

  const validator = await getAuditValidator();
  if (!validator(payload)) {
    console.error(`Invalid audit payload in ${filePath}`, validator.errors);
    process.exit(1);
  }

  const result = await insertAudit(payload);

  if (result.exists) {
    if (!refresh) {
      console.log(`Audit already exists: ${payload.auditId}`);
      return;
    }

    await deleteAudit(payload.auditId);
    await insertAudit(payload);
    console.log(`Refreshed audit: ${payload.auditId}`);
    return;
  }

  console.log(`Seeded audit: ${payload.auditId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
