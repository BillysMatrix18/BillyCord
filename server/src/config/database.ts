import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite3 = require('sqlite3').verbose();

// External database path — stored OUTSIDE the project folder so data persists across updates.
// On Windows: C:\Users\billy\OneDrive\Documents\BillyCord\Database\billycord.db
// Fallback: project root (for Linux/CI environments)
function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;

  // Try external Windows path first
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const externalDir = path.join(homeDir, 'OneDrive', 'Documents', 'BillyCord', 'Database');
  const externalDb = path.join(externalDir, 'billycord.db');

  // If on Windows (or external folder already exists), use external path
  if (process.platform === 'win32' || fs.existsSync(externalDir)) {
    try {
      if (!fs.existsSync(externalDir)) {
        fs.mkdirSync(externalDir, { recursive: true });
        console.log('Created external database folder:', externalDir);
      }
      return externalDb;
    } catch {
      console.warn('Could not create external DB folder, falling back to project root');
    }
  }

  return path.join(process.cwd(), 'billycord.db');
}

const DB_PATH = resolveDbPath();

// Ensure parent directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err: Error | null) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
  console.log('Database loaded from:', DB_PATH);
  console.log('Database folder:', dbDir);
});

// Enable WAL mode for better concurrency and foreign key enforcement
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');
// Wait up to 10s for locked database instead of failing immediately
db.run('PRAGMA busy_timeout = 10000');

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
function processRow(row: DbRow): DbRow {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = any;

/** Promisified db.all — returns rows (for SELECT / RETURNING) */
function dbAll(sql: string, params: unknown[]): Promise<DbRow[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows: DbRow[]) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/** Promisified db.run — for INSERT/UPDATE/DELETE without RETURNING */
function dbRun(sql: string, params: unknown[]): Promise<{ changes: number; lastID: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (this: { changes: number; lastID: number }, err: Error | null) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

/** Promisified db.exec — for multi-statement SQL (migrations) */
function dbExec(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
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
    await dbExec(sql);
    return { rows: [] as DbRow[], rowCount: 0 };
  }

  const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');
  const hasReturning = /\bRETURNING\b/i.test(sql);

  if (isSelect || hasReturning) {
    const rows = await dbAll(sql, sqliteParams);
    rows.forEach(processRow);
    return { rows, rowCount: rows.length };
  } else {
    const result = await dbRun(sql, sqliteParams);
    return { rows: [] as Record<string, unknown>[], rowCount: result.changes };
  }
}

/**
 * Execute raw SQL (multi-statement). Used for migrations.
 */
export async function exec(sql: string) {
  await dbExec(sql);
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

export function getDbPath() {
  return DB_PATH;
}

export default db;
