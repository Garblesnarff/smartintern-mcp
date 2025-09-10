import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolWrapper } from './errors';

export function registerCanvasTools(server: McpServer) {
  server.tool(
    'create_canvas',
    'Create a new Slack canvas',
    {
      title: z.string().describe('Canvas title'),
      content: z.string().describe('Canvas content'),
      channel_id: z.string().optional().describe('Channel to share canvas in'),
    },
    toolWrapper('create_canvas', async ({ title, content, channel_id }: {
      title: string;
      content: string;
      channel_id?: string;
    }) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ title, content, channel_id, created: new Date().toISOString() }, null, 2),
          },
        ],
      };
    }),
  );
}