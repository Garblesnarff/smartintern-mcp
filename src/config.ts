import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  server: {
    name: 'SmartIntern',
    version: '1.0.0',
    description: 'MCP server for Slack integration, meeting notes, and follow-ups'
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    redirectUri: process.env.SLACK_REDIRECT_URI
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'smartintern',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
  }
};

export function validateConfig() {
  // Validate required Slack configurations
  if (!config.slack.botToken) {
    throw new Error('SLACK_BOT_TOKEN is required');
  }
  if (!config.slack.signingSecret) {
    throw new Error('SLACK_SIGNING_SECRET is required');
  }
  
  // Validate database configuration
  if (!config.database.password) {
    throw new Error('DB_PASSWORD is required');
  }
}
