import { readFile } from "node:fs/promises";
import { pool } from "./db.js";

const MIGRATE_ENV = "DB_AUTO_MIGRATE";

export async function runMigrations(): Promise<void> {
  const shouldMigrate = (process.env[MIGRATE_ENV] ?? "true").toLowerCase();
  if (shouldMigrate !== "true" && shouldMigrate !== "1" && shouldMigrate !== "yes") {
    return;
  }

  const schemaUrl = new URL("../db/schema.sql", import.meta.url);
  const raw = await readFile(schemaUrl, "utf-8");
  const statements = raw
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  const connection = await pool.getConnection();
  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
  } finally {
    connection.release();
  }
}
