import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from '../config';
import { registerChannelTools } from './tools/channel';
import { registerMessageTools } from './tools/message';
import { registerNoteTools } from './tools/notes';
import { registerFollowUpTools } from './tools/follow-up';

export async function startMcpServer() {
  // Create a new MCP server
  const server = new McpServer({
    name: config.server.name,
    version: config.server.version,
    description: config.server.description
  });

  // Register tools
  registerChannelTools(server);
  registerMessageTools(server);
  registerNoteTools(server);
  registerFollowUpTools(server);

  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.log('MCP server started');
  return server;
}
