/**
 * DATABASE MODELS AND INITIALIZATION - PostgreSQL Schema
 * 
 * This file defines the PostgreSQL database connection pool and initializes
 * all required tables for the SmartIntern MCP server. It creates schema for
 * storing Slack channels, messages, topics, meeting notes, and action items.
 * The tables support the MCP tools for Slack integration and data persistence.
 * 
 * Dependencies:
 * - pg: PostgreSQL client for Node.js
 * - src/config.ts: Database connection parameters
 * 
 * Tables Created:
 * - channels: Slack channel metadata
 * - messages: Slack message content and metadata
 * - topics: Conversation topics for message classification
 * - message_topics: Many-to-many relationship between messages and topics
 * - meeting_notes: Summarized meeting information with action items
 * - action_items: Trackable tasks from meetings or messages
 * 
 * @author Cline (built by Oak AI)
 */

// ====================================
// Imports
// ====================================
import { Pool } from 'pg';
import { config } from '../config';

/**
 * PostgreSQL connection pool for database operations.
 * 
 * This pool manages multiple connections to the PostgreSQL database using
 * configuration from the application config. It enables efficient, concurrent
 * database queries across the application (e.g., storing messages, notes).
 * The pool automatically handles connection acquisition and release.
 * 
 * Connection Parameters:
 * - host, port, database, user, password from config.database
 * 
 * @type {Pool}
 * @see https://node-postgres.com/apis/pool for pool documentation
 */
export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
});

/**
 * Initializes the database by creating all required tables.
 * 
 * This function connects to the database, executes CREATE TABLE statements
 * for all schema components, and handles errors gracefully. Tables are created
 * with IF NOT EXISTS to support idempotent initialization. Foreign keys ensure
 * data integrity between related entities (e.g., messages reference channels).
 * 
 * Schema Design Notes:
 * - Uses SERIAL for auto-incrementing IDs
 * - Timestamps default to NOW() for audit trails
 * - JSONB for flexible storage of action items and decisions
 * - Unique constraints on Slack IDs to prevent duplicates
 * 
 * @throws {Error} If database connection fails or table creation errors occur
 * @returns {Promise<void>} No return value on success
 * 
 * @example
 * await initializeDatabase(); // Creates tables if they don't exist
 */
export async function initializeDatabase() {
  // Acquire a client from the pool for the initialization transaction
  const client = await pool.connect();
  try {
    // Create tables if they don't exist - idempotent operation
    // This single query creates all tables with their relationships
    await client.query(`
      -- Channels table: Stores Slack channel metadata for workspace mapping
      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        slack_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        is_private BOOLEAN NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Messages table: Stores Slack message content and metadata
      -- Links to channels via foreign key for conversation context
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

      -- Topics table: Stores predefined or discovered conversation topics
      CREATE TABLE IF NOT EXISTS topics (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Message-Topic junction table: Many-to-many relationship
      -- Allows messages to be tagged with multiple topics for analysis
      CREATE TABLE IF NOT EXISTS message_topics (
        message_id INTEGER REFERENCES messages(id),
        topic_id INTEGER REFERENCES topics(id),
        PRIMARY KEY (message_id, topic_id)
      );

      -- Meeting notes table: Stores summarized meeting information
      -- Includes flexible JSONB fields for action items and decisions
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

      -- Action items table: Trackable tasks extracted from meetings/messages
      -- Supports assignee tracking, due dates, and status updates
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

    // Log success (commented out for production silence)
    // console.log('Database initialized successfully');
  } catch (error) {
    // Log and re-throw the error for upstream handling
    console.error('Failed to initialize database:', error);
    throw error;
  } finally {
    // Always release the client back to the pool, even on error
    client.release();
  }
}
