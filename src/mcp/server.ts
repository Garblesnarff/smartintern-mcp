import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from '../config';
import { registerAllTools } from './tools';

export async function startMcpServer() {
  // Create a new MCP server
  const server = new McpServer({
    name: config.server.name,
    version: config.server.version,
    description: config.server.description,
  });

  // Register all tools
  registerAllTools(server);

  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // console.log('MCP server started');
  return server;
}
