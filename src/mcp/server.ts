/**
 * MCP SERVER SETUP - Model Context Protocol Server
 * 
 * This file is responsible for creating and starting the MCP server instance.
 * It configures the server with metadata from the application config and
 * registers all available tools (Slack integration, database operations, etc.)
 * using stdio transport for communication. The server provides MCP tools for
 * external AI agents to interact with Slack workspaces and manage data.
 * 
 * Dependencies:
 * - @modelcontextprotocol/sdk/server/mcp.js: MCP server core
 * - @modelcontextprotocol/sdk/server/stdio.js: Stdio transport implementation
 * - src/config.ts: Server metadata (name, version, description)
 * - src/mcp/tools/index.ts: Tool registration functions
 * 
 * @author Cline (built by Oak AI)
 */

// ====================================
// Imports
// ====================================
// MCP SDK imports
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Project modules
import { config } from '../config';
import { registerAllTools } from './tools';

/**
 * Starts the MCP server with all tools registered.
 * 
 * This function creates a new MCP server instance using the configuration
 * metadata, registers all available tools (channel management, message handling,
 * notes, follow-ups, etc.), and connects it using stdio transport for
 * communication with the host environment. The server is designed to run
 * continuously and handle incoming tool execution requests.
 * 
 * Process:
 * 1. Create McpServer with name, version, and description from config
 * 2. Register all tools via registerAllTools() - see src/mcp/tools/index.ts
 * 3. Initialize stdio transport and connect the server
 * 4. Return the server instance for potential further management
 * 
 * @returns {Promise<McpServer>} The started MCP server instance
 * @throws {Error} If server creation, tool registration, or transport connection fails
 * 
 * @example
 * const server = await startMcpServer();
 * // Server now running and ready to handle tool calls
 */
export async function startMcpServer() {
  // Create a new MCP server instance with application metadata
  // This sets up the server identity and capabilities
  const server = new McpServer({
    name: config.server.name,
    version: config.server.version,
    description: config.server.description,
  });

  // Register all available tools with the server
  // This makes Slack integration, database tools, etc. available via MCP
  // See: src/mcp/tools/index.ts for the complete list of registered tools
  registerAllTools(server);

  // Start the server with stdio transport for communication
  // Stdio transport allows the server to communicate over standard input/output
  // This is the standard transport for MCP servers in development/hosted environments
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log success (commented out for production silence)
  // console.log('MCP server started');

  // Return the server instance - can be used for shutdown or monitoring if needed
  return server;
}
