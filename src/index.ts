import { validateConfig } from './config';
import { initializeDatabase } from './db/models';
import { startMcpServer } from './mcp/server';

async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Initialize database
    await initializeDatabase();

    // Start MCP server
    const server = await startMcpServer();

    // console.log('SmartIntern MCP server started successfully');
  } catch (error) {
    console.error('Failed to start SmartIntern MCP server:', error);
    process.exit(1);
  }
}

main();
