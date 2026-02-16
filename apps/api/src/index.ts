import "./env.js";
import { runMigrations } from "./migrate.js";
import { buildApp } from "./app.js";

const app = buildApp();

const start = async () => {
  try {
    const port = Number(process.env.PORT ?? 3000);
    await runMigrations();
    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
