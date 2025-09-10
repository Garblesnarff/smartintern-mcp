/**
 * MAIN ENTRY POINT - SmartIntern MCP Server
 * 
 * This file serves as the primary entry point for the SmartIntern MCP server.
 * It orchestrates the startup sequence: configuration validation, database
 * initialization, and MCP server launch. The server integrates Slack with
 * MCP tools for channel management, message handling, notes, and follow-ups.
 * 
 * Dependencies:
 * - src/config.ts: Configuration validation and environment setup
 * - src/db/models.ts: Database connection and table initialization
 * - src/mcp/server.ts: MCP server creation and tool registration
 * 
 * @author Cline (built by Oak AI)
 */

// ====================================
// Imports
// ====================================
import { validateConfig } from './config';
import { initializeDatabase } from './db/models';
import { startMcpServer } from './mcp/server';

/**
 * Main startup function for the SmartIntern MCP server.
 * 
 * This function executes the sequential startup process:
 * 1. Validates environment configuration (throws if invalid)
 * 2. Initializes PostgreSQL database and creates necessary tables
 * 3. Starts the MCP server with all tools registered
 * 
 * @throws {Error} If configuration is invalid, database fails to initialize, or server startup errors occur
 * @returns {Promise<void>} No return value; exits process on error
 * 
 * @example
 * main(); // Called immediately after definition
 */
async function main() {
  try {
    // Validate configuration - ensures all required env vars are set
    // See: src/config.ts for validation logic
    validateConfig();

    // Initialize database - creates tables for channels, messages, notes, etc.
    // See: src/db/models.ts for table schemas
    await initializeDatabase();

    // Start MCP server - registers tools and starts stdio transport
    // See: src/mcp/server.ts for server setup
    const server = await startMcpServer();

    // Log success (commented out for production silence)
    // console.log('SmartIntern MCP server started successfully');
  } catch (error) {
    // Handle any startup errors gracefully and exit with failure code
    console.error('Failed to start SmartIntern MCP server:', error);
    process.exit(1);
  }
}

// Start the application immediately
main();
