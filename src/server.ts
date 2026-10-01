import { createServer } from "node:http";

import { createApp } from "./app.js";
import { pool } from "./config/database.js";
import { env } from "./config/env.js";

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, "0.0.0.0", () => {
  console.log(`ProjectTrix API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received. Closing server.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
