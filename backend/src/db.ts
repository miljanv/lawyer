import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

function normalizeConnectionString(raw?: string): string {
  if (!raw || !raw.trim()) {
    throw new Error("DATABASE_URL is missing. Set it in backend/.env");
  }

  let value = raw.trim();

  // Supports copied values like: psql 'postgresql://...'
  if (value.startsWith("psql ")) {
    value = value.slice(5).trim();
  }

  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1);
  }

  return value;
}

export const db = new Pool({
  connectionString: normalizeConnectionString(process.env.DATABASE_URL),
});

export async function initDb(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS qa_history (
      id BIGSERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL,
      category TEXT NOT NULL DEFAULT 'Opšte',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE qa_history
    ADD COLUMN IF NOT EXISTS document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL
  `);

  await db.query(`
    ALTER TABLE qa_history
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Opšte'
  `);
}
