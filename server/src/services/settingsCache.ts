import { query } from '../config/database';

// In-memory cache of all server settings
let settingsCache: Record<string, string> = {};
let loaded = false;

// Rate limit tracking: userId -> { count, windowStart }
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

/** Load all settings from database into memory */
export async function loadSettings(): Promise<void> {
  try {
    const result = await query('SELECT setting_key, setting_value FROM server_settings');
    settingsCache = {};
    for (const row of result.rows) {
      settingsCache[row.setting_key] = row.setting_value;
    }
    loaded = true;
    console.log(`Settings loaded: ${Object.keys(settingsCache).length} keys`);
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

/** Reload settings (call after admin updates) */
export async function reloadSettings(): Promise<void> {
  await loadSettings();
}

/** Get a setting value as string */
export function getSetting(key: string, defaultValue: string = ''): string {
  return settingsCache[key] ?? defaultValue;
}

/** Get a setting as integer */
export function getSettingInt(key: string, defaultValue: number): number {
  const val = settingsCache[key];
  if (val === undefined) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/** Get a setting as boolean */
export function getSettingBool(key: string, defaultValue: boolean): boolean {
  const val = settingsCache[key];
  if (val === undefined) return defaultValue;
  return val === 'true';
}

/** Check if message rate limit exceeded for a user. Returns true if BLOCKED. */
export function checkRateLimit(userId: string): boolean {
  const maxPerMin = getSettingInt('rate_limit_messages', 20);
  if (maxPerMin <= 0) return false; // 0 = unlimited

  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now - entry.windowStart > 60000) {
    // New window
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  if (entry.count > maxPerMin) {
    return true; // rate limited
  }
  return false;
}

/** Check if settings have been loaded */
export function isLoaded(): boolean {
  return loaded;
}
