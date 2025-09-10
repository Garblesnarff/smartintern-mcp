import { Pool } from 'pg';
import { config } from '../config';

// Create a connection pool to the PostgreSQL database
export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
});

// Initialize database tables
export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Create tables if they don't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        slack_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        is_private BOOLEAN NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        slack_id TEXT UNIQUE NOT NULL,
        channel_id INTEGER REFERENCES channels(id),
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        thread_ts TEXT,
        has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS topics (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS message_topics (
        message_id INTEGER REFERENCES messages(id),
        topic_id INTEGER REFERENCES topics(id),
        PRIMARY KEY (message_id, topic_id)
      );

      CREATE TABLE IF NOT EXISTS meeting_notes (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        channel_id INTEGER REFERENCES channels(id),
        start_ts TEXT NOT NULL,
        end_ts TEXT NOT NULL,
        participants TEXT[],
        action_items JSONB,
        decisions JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS action_items (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        assignee TEXT,
        due_date TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'open',
        channel_id INTEGER REFERENCES channels(id),
        message_id INTEGER REFERENCES messages(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  } finally {
    client.release();
  }
}
