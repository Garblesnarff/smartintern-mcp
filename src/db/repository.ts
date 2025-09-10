/**
 * DATABASE REPOSITORY - Data Access Layer
 * 
 * This file implements the data access layer for the SmartIntern MCP server.
 * The ContextRepository class provides methods for storing and retrieving
 * Slack channels, messages, meeting notes, and action items in the PostgreSQL
 * database. It uses prepared statements with parameterized queries to prevent
 * SQL injection and handles connection pooling for efficient database operations.
 * 
 * Design Decisions:
 * - Singleton pattern: One repository instance shared across the application
 * - UPSERT operations: Handle both insert and update in single query for idempotency
 * - Error handling: Logs errors and re-throws for upstream error management
 * - Connection management: Always releases clients back to pool in finally blocks
 * 
 * Dependencies:
 * - src/db/models.ts: Database pool and connection
 * 
 * @author Cline (built by Oak AI)
 */

// ====================================
// Imports
// ====================================
import { pool } from './models';

/**
 * Repository class for database operations related to application context.
 * 
 * This class encapsulates all database interactions for storing and retrieving
 * Slack-related data (channels, messages), meeting notes, and action items.
 * Each method uses the connection pool from models.ts and follows consistent
 * patterns for error handling and resource cleanup.
 * 
 * Why Singleton? Using a single instance prevents multiple repository objects
 * and ensures consistent database access patterns throughout the application.
 */
export class ContextRepository {
  /**
   * Stores or updates a Slack channel in the database.
   * 
   * This method performs an UPSERT operation: inserts the channel if it doesn't
   * exist, or updates the name and privacy status if the slack_id already exists.
   * The returned object contains the internal database ID for the channel.
   * 
   * @param {Object} channelData - Slack channel information
   * @param {string} channelData.id - Unique Slack channel ID
   * @param {string} channelData.name - Channel name
   * @param {boolean} channelData.is_private - Whether the channel is private
   * @returns {Promise<Object>} Database record with id, slack_id, name, is_private
   * @throws {Error} If database insertion/update fails
   * 
   * @example
   * const channel = await storeChannel({
   *   id: 'C1234567890',
   *   name: 'general',
   *   is_private: false
   * });
   */
  async storeChannel(channelData: any) {
    // Acquire database client from pool
    const client = await pool.connect();
    try {
      // UPSERT query: Insert or update channel based on slack_id
      // Returns the internal ID for use in related records (messages, notes)
      const result = await client.query(
        `INSERT INTO channels (slack_id, name, is_private)
         VALUES ($1, $2, $3)
         ON CONFLICT (slack_id) DO UPDATE
         SET name = $2, is_private = $3
         RETURNING id`,
        [channelData.id, channelData.name, channelData.is_private],
      );
      return result.rows[0];
    } catch (error) {
      // Log error for debugging but re-throw for upstream handling
      console.error('Error storing channel:', error);
      throw error;
    } finally {
      // Ensure client is always returned to pool
      client.release();
    }
  }

  /**
   * Stores or updates a Slack message in the database.
   * 
   * This method handles message persistence with timestamp conversion from
   * Slack's Unix timestamp format to JavaScript Date. It supports thread
   * tracking and attachment detection. Uses UPSERT to handle duplicate messages.
   * 
   * @param {Object} messageData - Slack message data
   * @param {string} messageData.ts - Slack message timestamp (Unix format)
   * @param {string} messageData.user - Slack user ID
   * @param {string} messageData.text - Message content
   * @param {string} [messageData.thread_ts] - Thread parent timestamp
   * @param {Array} [messageData.attachments] - Message attachments
   * @param {number} channelId - Internal database channel ID
   * @returns {Promise<Object>} Database record with message ID
   * @throws {Error} If database insertion/update fails
   */
  async storeMessage(messageData: any, channelId: number) {
    // Acquire database client from pool
    const client = await pool.connect();
    try {
      // Convert Slack timestamp (e.g., '1234567890.123456') to Date
      // Multiply by 1000 to convert seconds to milliseconds
      const messageTimestamp = new Date(parseFloat(messageData.ts) * 1000);
      
      // Boolean conversion for attachments presence
      const hasAttachments = !!messageData.attachments;

      // UPSERT query: Insert or update message, only update text on conflict
      // This handles message edits while preserving original metadata
      const result = await client.query(
        `INSERT INTO messages (slack_id, channel_id, user_id, text, timestamp, thread_ts, has_attachments)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (slack_id) DO UPDATE
         SET text = $4
         RETURNING id`,
        [
          messageData.ts,
          channelId,
          messageData.user,
          messageData.text,
          messageTimestamp,
          messageData.thread_ts,
          hasAttachments,
        ],
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error storing message:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Stores meeting notes in the database.
   * 
   * This method persists summarized meeting information including participants,
   * action items, and decisions stored as JSONB for flexible querying. It's
   * designed for MCP tools that generate meeting summaries from Slack conversations.
   * 
   * @param {Object} notesData - Meeting notes data
   * @param {string} notesData.title - Meeting title
   * @param {string} notesData.summary - Meeting summary
   * @param {string} notesData.start_ts - Meeting start timestamp
   * @param {string} notesData.end_ts - Meeting end timestamp
   * @param {Array<string>} [notesData.participants] - Array of participant user IDs
   * @param {Object} [notesData.action_items] - Action items as object
   * @param {Object} [notesData.decisions] - Decisions made during meeting
   * @param {number} channelId - Internal database channel ID
   * @returns {Promise<Object>} Database record with notes ID
   * @throws {Error} If database insertion fails
   */
  async storeMeetingNotes(notesData: any, channelId: number) {
    const client = await pool.connect();
    try {
      // Convert complex objects to JSON strings for JSONB storage
      // This allows flexible querying and indexing on action items/decisions
      const actionItemsJson = JSON.stringify(notesData.action_items || {});
      const decisionsJson = JSON.stringify(notesData.decisions || {});

      const result = await client.query(
        `INSERT INTO meeting_notes (title, summary, channel_id, start_ts, end_ts, participants, action_items, decisions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          notesData.title,
          notesData.summary,
          channelId,
          notesData.start_ts,
          notesData.end_ts,
          notesData.participants || [],
          actionItemsJson,
          decisionsJson,
        ],
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error storing meeting notes:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Stores an action item extracted from meetings or messages.
   * 
   * This method creates trackable tasks with assignee, due date, and status.
   * Action items can be linked to specific messages or channels for context.
   * Default status is 'open' for new items.
   * 
   * @param {Object} actionItem - Action item details
   * @param {string} actionItem.description - Task description
   * @param {string} [actionItem.assignee] - Assigned user ID
   * @param {string|Date} [actionItem.due_date] - Due date string or Date
   * @param {string} [actionItem.status] - Task status (default: 'open')
   * @param {number} channelId - Internal database channel ID
   * @param {number} [messageId] - Optional linked message ID
   * @returns {Promise<Object>} Database record with action item ID
   * @throws {Error} If database insertion fails
   */
  async storeActionItem(actionItem: any, channelId: number, messageId?: number) {
    const client = await pool.connect();
    try {
      // Convert due_date string to Date or null if not provided
      const dueDate = actionItem.due_date ? new Date(actionItem.due_date) : null;
      
      // Default status to 'open' if not specified
      const status = actionItem.status || 'open';

      const result = await client.query(
        `INSERT INTO action_items (description, assignee, due_date, status, channel_id, message_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          actionItem.description,
          actionItem.assignee,
          dueDate,
          status,
          channelId,
          messageId,
        ],
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error storing action item:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves recent messages from a specific channel.
   * 
   * This method fetches the most recent messages from a channel, ordered by
   * timestamp descending. Useful for conversation context in MCP tools.
   * Default limit is 100 messages; can be adjusted for different use cases.
   * 
   * @param {number} channelId - Internal database channel ID
   * @param {number} [limit=100] - Maximum number of messages to return
   * @returns {Promise<Array>} Array of message records
   * @throws {Error} If database query fails
   */
  async getRecentMessages(channelId: number, limit = 100) {
    const client = await pool.connect();
    try {
      // Query recent messages ordered by timestamp (most recent first)
      // This supports conversation analysis and context retrieval
      const result = await client.query(
        `SELECT * FROM messages
         WHERE channel_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [channelId, limit],
      );
      return result.rows;
    } catch (error) {
      console.error(`Error fetching recent messages for channel ${channelId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves action items, optionally filtered by status.
   * 
   * This method fetches action items with optional status filtering (e.g., 'open', 'completed').
   * Includes channel name via JOIN for better reporting. Returns all action items if no status specified.
   * 
   * @param {string} [status] - Optional status filter ('open', 'completed', etc.)
   * @returns {Promise<Array>} Array of action item records with channel name
   * @throws {Error} If database query fails
   */
  async getActionItems(status?: string) {
    const client = await pool.connect();
    try {
      // Base query with JOIN to include channel names for context
      let query = `SELECT a.*, c.name as channel_name 
                  FROM action_items a
                  JOIN channels c ON a.channel_id = c.id`;

      if (status) {
        // Add status filter when specified
        query += ` WHERE a.status = $1`;
        const result = await client.query(query, [status]);
        return result.rows;
      } else {
        // Return all action items without filtering
        const result = await client.query(query);
        return result.rows;
      }
    } catch (error) {
      console.error('Error fetching action items:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

// ====================================
// Singleton Instance
// ====================================

// Export a singleton instance of the repository
// This ensures consistent database access patterns and prevents multiple instances
// The singleton pattern is used because database connections should be managed centrally
export const contextRepository = new ContextRepository();
