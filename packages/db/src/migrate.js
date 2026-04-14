import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for migrations");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../migrations");

const pool = new Pool({ connectionString });

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function runMigrations() {
  await ensureMigrationsTable();
  const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

  for (const file of files) {
    const migrationId = file.replace(".sql", "");
    const check = await pool.query("SELECT id FROM schema_migrations WHERE id = $1", [migrationId]);
    if (check.rowCount > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migrationId]);
      await pool.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}

runMigrations()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Migration failed:", error);
    await pool.end();
    process.exit(1);
  });
