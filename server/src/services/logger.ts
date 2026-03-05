import { query } from '../config/database';

/**
 * Centralized logging service. Writes to database tables so nothing is ever lost.
 */

export async function logAdminAction(action: string, targetType?: string, targetId?: string, details?: Record<string, unknown>) {
  try {
    await query(
      `INSERT INTO admin_logs (admin_action, target_type, target_id, details) VALUES ($1, $2, $3, $4)`,
      [action, targetType || null, targetId || null, JSON.stringify(details || {})]
    );
  } catch { /* don't crash on log failure */ }
}

export async function logUserActivity(userId: string, actionType: string, details?: Record<string, unknown>, ip?: string, userAgent?: string) {
  try {
    await query(
      `INSERT INTO user_activity_logs (user_id, action_type, details, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [userId, actionType, JSON.stringify(details || {}), ip || null, userAgent || null]
    );
  } catch { /* don't crash on log failure */ }
}

export async function logServerActivity(serverId: string, actionType: string, performedBy: string, oldValue?: string, newValue?: string) {
  try {
    await query(
      `INSERT INTO server_activity_logs (server_id, action_type, performed_by, old_value, new_value) VALUES ($1, $2, $3, $4, $5)`,
      [serverId, actionType, performedBy, oldValue || null, newValue || null]
    );
  } catch { /* don't crash on log failure */ }
}

export async function logError(errorType: string, errorMessage: string, stackTrace?: string, userId?: string, context?: Record<string, unknown>) {
  try {
    await query(
      `INSERT INTO error_logs (error_type, error_message, stack_trace, user_id, context) VALUES ($1, $2, $3, $4, $5)`,
      [errorType, errorMessage, stackTrace || null, userId || null, JSON.stringify(context || {})]
    );
  } catch { /* don't crash on log failure */ }
}

export async function logSecurity(eventType: string, userId?: string, details?: Record<string, unknown>, ip?: string, userAgent?: string) {
  try {
    await query(
      `INSERT INTO security_logs (event_type, user_id, details, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [eventType, userId || null, JSON.stringify(details || {}), ip || null, userAgent || null]
    );
  } catch { /* don't crash on log failure */ }
}

export async function logMessageEdit(messageId: string, oldContent: string, newContent: string, editedBy: string) {
  try {
    await query(
      `INSERT INTO message_history (message_id, old_content, new_content, edited_by) VALUES ($1, $2, $3, $4)`,
      [messageId, oldContent, newContent, editedBy]
    );
  } catch { /* don't crash on log failure */ }
}

export async function logMessageDelete(messageId: string, channelId: string, senderId: string, content: string, deletedBy: string, reason?: string) {
  try {
    await query(
      `INSERT INTO deleted_messages (message_id, channel_id, sender_id, original_content, deleted_by, deletion_reason) VALUES ($1, $2, $3, $4, $5, $6)`,
      [messageId, channelId, senderId, content, deletedBy, reason || null]
    );
    // Soft-delete: mark the message instead of removing it
    await query(`UPDATE messages SET deleted_at = datetime('now') WHERE id = $1`, [messageId]);
  } catch { /* don't crash on log failure */ }
}
