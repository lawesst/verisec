import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(fileName: string, { override }: { override: boolean }) {
  const moduleDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const candidatePaths = [
    resolve(process.cwd(), fileName),
    resolve(moduleDir, fileName)
  ];
  for (const filePath of candidatePaths) {
    if (!existsSync(filePath)) {
      continue;
    }
    const raw = readFileSync(filePath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (!key) {
        continue;
      }
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!override && process.env[key] !== undefined) {
        continue;
      }
      process.env[key] = value;
    }
  }
}

// Load from files without overriding explicitly exported shell variables.
loadEnvFile(".env.local", { override: false });
loadEnvFile(".env", { override: false });
