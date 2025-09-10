/**
 * CONFIGURATION MANAGEMENT - Environment and Validation
 * 
 * This file handles loading environment variables using dotenv and creates
 * a centralized configuration object for the SmartIntern MCP server. It also
 * provides validation to ensure all required environment variables are set
 * before the application starts. The config is structured into sections for
 * server metadata, Slack integration, and database connection details.
 * 
 * Dependencies:
 * - dotenv: For loading .env files
 * 
 * Environment Variables Expected:
 * - SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI
 * - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 * 
 * @author Cline (built by Oak AI)
 */

// ====================================
// Imports
// ====================================
import dotenv from 'dotenv';

// ====================================
// Environment Setup
// ====================================

// Load environment variables from .env file into process.env
// This makes all .env variables available throughout the application
dotenv.config();

/**
 * Centralized configuration object for the SmartIntern MCP server.
 * 
 * This object aggregates all configuration values from environment variables
 * and provides defaults where appropriate. It's used across the application
 * for server setup, Slack API authentication, and database connection.
 * 
 * Structure:
 * - server: MCP server metadata (name, version, description)
 * - slack: Slack API credentials and OAuth settings
 * - database: PostgreSQL connection parameters
 * 
 * @type {Object}
 * @property {Object} server - MCP server configuration
 * @property {Object} slack - Slack integration configuration
 * @property {Object} database - Database connection configuration
 */
export const config = {
  server: {
    name: 'SmartIntern',
    version: '1.0.0',
    description: 'MCP server for Slack integration, meeting notes, and follow-ups',
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    redirectUri: process.env.SLACK_REDIRECT_URI,
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'smartintern',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  },
};

/**
 * Validates the application configuration.
 * 
 * This function checks that all required environment variables are present
 * and throws descriptive errors if any are missing. It's called during
 * application startup to prevent runtime failures due to misconfiguration.
 * 
 * Required Variables:
 * - SLACK_BOT_TOKEN: For authenticating Slack bot API calls
 * - SLACK_SIGNING_SECRET: For verifying incoming Slack requests
 * - DB_PASSWORD: For PostgreSQL database authentication
 * 
 * @throws {Error} If any required configuration is missing
 * @returns {void}
 * 
 * @example
 * validateConfig(); // Throws if config invalid, otherwise does nothing
 */
export function validateConfig() {
  // Validate required Slack configurations
  // These are essential for Slack API authentication and request verification
  if (!config.slack.botToken) {
    throw new Error('SLACK_BOT_TOKEN is required');
  }
  if (!config.slack.signingSecret) {
    throw new Error('SLACK_SIGNING_SECRET is required');
  }

  // Validate database configuration
  // DB_PASSWORD is required for secure database connections
  if (!config.database.password) {
    throw new Error('DB_PASSWORD is required');
  }
}
