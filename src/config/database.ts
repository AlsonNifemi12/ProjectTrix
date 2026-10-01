import pg from "pg";

import { env, isProduction } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

export async function checkDatabase() {
  const result = await pool.query<{ now: Date }>("SELECT NOW() AS now");
  return result.rows[0]?.now;
}
