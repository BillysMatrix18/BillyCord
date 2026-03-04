import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

// Database file path — defaults to project root billycord.db
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', '..', 'billycord.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency and foreign key enforcement
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('SQLite database opened:', DB_PATH);

/**
 * Convert PostgreSQL-style SQL to SQLite-compatible SQL.
 * Handles: $1/$2 params, NOW(), ILIKE, type casts.
 */
function convertSql(text: string, params?: unknown[]): { sql: string; params: unknown[] } {
  const newParams: unknown[] = [];

  const sql = text
    // NOW() → datetime('now')
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    // ILIKE → LIKE
    .replace(/\bILIKE\b/gi, 'LIKE')
    // Remove PostgreSQL type casts like ::text, ::json, ::jsonb, ::uuid
    .replace(/::(text|json|jsonb|uuid|integer|int|varchar|boolean|timestamptz)/gi, '')
    // Replace $N params with ? and remap parameter values
    .replace(/\$(\d+)/g, (_, num) => {
      newParams.push((params || [])[parseInt(num) - 1]);
      return '?';
    });

  return { sql, params: newParams };
}

/**
 * Auto-parse JSON strings in result rows (TEXT columns storing JSON).
 */
function processRow(row: Record<string, unknown>): Record<string, unknown> {
  if (!row || typeof row !== 'object') return row;
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (typeof val === 'string') {
      if ((val.startsWith('[') && val.endsWith(']')) || (val.startsWith('{') && val.endsWith('}'))) {
        try { row[key] = JSON.parse(val); } catch { /* keep as string */ }
      }
    }
  }
  return row;
}

/**
 * Execute a SQL query with PostgreSQL-style $N parameters.
 * Returns { rows, rowCount } matching the pg interface.
 */
export async function query(text: string, params?: unknown[]) {
  const { sql, params: sqliteParams } = convertSql(text, params);
  const trimmed = sql.trim().toUpperCase();

  // Transaction control statements
  if (trimmed === 'BEGIN' || trimmed === 'COMMIT' || trimmed === 'ROLLBACK') {
    db.exec(sql);
    return { rows: [], rowCount: 0 };
  }

  const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');
  const hasReturning = /\bRETURNING\b/i.test(sql);

  if (isSelect || hasReturning) {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...sqliteParams) as Record<string, unknown>[];
    rows.forEach(processRow);
    return { rows, rowCount: rows.length };
  } else {
    const stmt = db.prepare(sql);
    const result = stmt.run(...sqliteParams);
    return { rows: [], rowCount: result.changes };
  }
}

/**
 * Execute raw SQL (multi-statement). Used for migrations.
 */
export function exec(sql: string) {
  db.exec(sql);
}

/**
 * Get a client-like object for transaction support (pg-compatible interface).
 */
export async function getClient() {
  return {
    query: async (text: string, params?: unknown[]) => query(text, params),
    release: () => { /* no-op for SQLite */ },
  };
}

/**
 * Generate a UUID v4 string.
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

export function getDb() {
  return db;
}

export default db;
