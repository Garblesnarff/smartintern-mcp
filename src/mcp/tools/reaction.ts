import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolWrapper } from './errors';

export function registerReactionTools(server: McpServer) {
  server.tool(
    'add_reaction',
    'Add a reaction to a message',
    {
      channel_id: z.string().describe('Channel ID'),
      timestamp: z.string().describe('Message timestamp'),
      reaction: z.string().describe('Emoji reaction name'),
    },
    toolWrapper('add_reaction', async ({ channel_id, timestamp, reaction }: {
      channel_id: string;
      timestamp: string;
      reaction: string;
    }) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ channel_id, timestamp, reaction, added: new Date().toISOString() }, null, 2),
          },
        ],
      };
    }),
  );
}