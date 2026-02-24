import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const mappings = [
  ["apps/api/.env.example", "apps/api/.env.local"],
  ["apps/web/.env.example", "apps/web/.env.local"]
];

let created = 0;

for (const [from, to] of mappings) {
  const source = resolve(cwd, from);
  const target = resolve(cwd, to);
  if (existsSync(target)) {
    continue;
  }
  copyFileSync(source, target);
  created += 1;
  console.log(`created ${to}`);
}

if (created === 0) {
  console.log("env files already exist");
}
