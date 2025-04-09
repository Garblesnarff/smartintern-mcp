import { pool } from './models';

export class ContextRepository {
  async storeChannel(channelData: any) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO channels (slack_id, name, is_private)
         VALUES ($1, $2, $3)
         ON CONFLICT (slack_id) DO UPDATE
         SET name = $2, is_private = $3
         RETURNING id`,
        [channelData.id, channelData.name, channelData.is_private]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error storing channel:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async storeMessage(messageData: any, channelId: number) {
    const client = await pool.connect();
    try {
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
          new Date(parseFloat(messageData.ts) * 1000),
          messageData.thread_ts,
          !!messageData.attachments
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error storing message:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async storeMeetingNotes(notesData: any, channelId: number) {
    const client = await pool.connect();
    try {
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
          notesData.participants,
          JSON.stringify(notesData.action_items),
          JSON.stringify(notesData.decisions)
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error storing meeting notes:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async storeActionItem(actionItem: any, channelId: number, messageId?: number) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO action_items (description, assignee, due_date, status, channel_id, message_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          actionItem.description,
          actionItem.assignee,
          actionItem.due_date ? new Date(actionItem.due_date) : null,
          actionItem.status || 'open',
          channelId,
          messageId
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error storing action item:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getRecentMessages(channelId: number, limit = 100) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM messages
         WHERE channel_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [channelId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error(`Error fetching recent messages for channel ${channelId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getActionItems(status?: string) {
    const client = await pool.connect();
    try {
      let query = `SELECT a.*, c.name as channel_name 
                  FROM action_items a
                  JOIN channels c ON a.channel_id = c.id`;
      
      if (status) {
        query += ` WHERE a.status = $1`;
        const result = await client.query(query, [status]);
        return result.rows;
      } else {
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

// Export a singleton instance
export const contextRepository = new ContextRepository();
