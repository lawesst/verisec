import { execSync, spawn } from "node:child_process";

const apiUrl = process.env.API_BASE_URL ?? "http://localhost:4010";
const healthUrl = new URL("/health", apiUrl).toString();

async function main() {
  execSync("npm run infra:up", { stdio: "inherit" });
  execSync("npm run build:api", { stdio: "inherit" });
  await runSeedWithRetry();

  const apiProcess = spawn("npm", ["run", "start:api"], {
    stdio: "inherit",
    env: process.env
  });
  const apiFailed = new Promise((_, reject) => {
    apiProcess.on("error", (error) => {
      reject(error);
    });
    apiProcess.on("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(`api process exited with code ${code}`));
      }
    });
  });

  try {
    await Promise.race([waitForHealth(healthUrl, 45_000), apiFailed]);
    execSync("npm run smoke", {
      stdio: "inherit",
      env: {
        ...process.env,
        API_BASE_URL: apiUrl
      }
    });
  } finally {
    if (!apiProcess.killed) {
      apiProcess.kill("SIGINT");
    }
  }
}

async function runSeedWithRetry() {
  const attempts = 8;
  for (let index = 1; index <= attempts; index += 1) {
    try {
      execSync("npm run seed", { stdio: "inherit" });
      return;
    } catch (error) {
      if (index === attempts) {
        throw error;
      }
      console.log(`seed retry ${index}/${attempts - 1}: waiting for MySQL...`);
      await delay(2_000);
    }
  }
}

async function waitForHealth(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // ignore until timeout
    }
    await delay(1_000);
  }
  throw new Error(`api did not become healthy in ${timeoutMs}ms: ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
