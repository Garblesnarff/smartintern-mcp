import { validateConfig } from './config';
import { initializeDatabase } from './db/models';
import { startMcpServer } from './mcp/server';
import { startSlackEventsServer } from './events/server';

async function main() {
  try {
    // Validate configuration
    validateConfig();
    
    // Initialize database
    await initializeDatabase();
    
    // Start MCP server and Slack Events server concurrently
    await Promise.all([
      startMcpServer(),
      startSlackEventsServer()
    ]);
    
    console.log('SmartIntern MCP server and Slack Events server started successfully');
  } catch (error) {
    console.error('Failed to start servers:', error);
    process.exit(1);
  }
}

main();
