import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolWrapper } from './errors';

export function registerWorkspaceTools(server: McpServer) {
  server.tool(
    'get_workspace_info',
    'Get information about the current Slack workspace',
    {},
    toolWrapper('get_workspace_info', async () => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ workspace: 'default', accessed: new Date().toISOString() }, null, 2),
          },
        ],
      };
    }),
  );
}