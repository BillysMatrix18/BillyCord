import path from 'path';
import fs from 'fs';
import { query } from '../config/database';
import { getDbPath } from '../config/database';

/**
 * Export logs to CSV and JSON files in the same folder as the database.
 * Runs hourly via setInterval.
 */

function getExportDir(): string {
  return path.dirname(getDbPath());
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const vals = headers.map(h => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Escape CSV: wrap in quotes if contains comma, quote, or newline
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

async function exportTable(tableName: string, fileName: string, orderCol = 'created_at') {
  try {
    const dir = getExportDir();
    const result = await query(`SELECT * FROM ${tableName} ORDER BY ${orderCol} DESC LIMIT 10000`);
    if (result.rows.length === 0) return;

    fs.writeFileSync(path.join(dir, `${fileName}.csv`), toCsv(result.rows), 'utf-8');
    fs.writeFileSync(path.join(dir, `${fileName}.json`), JSON.stringify(result.rows, null, 2), 'utf-8');
  } catch (err) {
    // Silently skip if table doesn't exist yet
    if (String(err).includes('no such table')) return;
    console.error(`Log export error (${tableName}):`, err);
  }
}

async function exportDailyMessages() {
  try {
    const dir = getExportDir();
    const today = new Date().toISOString().split('T')[0];
    const result = await query(
      `SELECT m.id, m.channel_id, m.sender_id, m.content, m.created_at, u.username as sender_name
       FROM messages m LEFT JOIN users u ON m.sender_id = u.id
       WHERE date(m.created_at) = date('now') AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC`
    );
    if (result.rows.length === 0) return;
    fs.writeFileSync(path.join(dir, `messages_daily_${today}.csv`), toCsv(result.rows), 'utf-8');
  } catch {
    // ignore
  }
}

export async function runLogExport() {
  try {
    await exportTable('admin_logs', 'admin_logs');
    await exportTable('user_activity_logs', 'user_activity_logs');
    await exportTable('error_logs', 'error_logs');
    await exportTable('security_logs', 'security_logs');
    await exportTable('deleted_messages', 'deleted_messages', 'deleted_at');
    await exportDailyMessages();
    console.log(`Log export completed to: ${getExportDir()}`);
  } catch (err) {
    console.error('Log export error:', err);
  }
}

// Start hourly export timer
let exportTimer: ReturnType<typeof setInterval> | null = null;

export function startLogExporter() {
  // Run initial export after 30 seconds (let DB initialize first)
  setTimeout(() => runLogExport(), 30000);
  // Then every hour
  exportTimer = setInterval(() => runLogExport(), 60 * 60 * 1000);
  console.log('Log exporter started (hourly exports to database folder)');
}

export function stopLogExporter() {
  if (exportTimer) {
    clearInterval(exportTimer);
    exportTimer = null;
  }
}
