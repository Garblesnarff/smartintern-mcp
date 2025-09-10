import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolWrapper } from './errors';

export function registerReminderTools(server: McpServer) {
  server.tool(
    'create_reminder',
    'Create a reminder for a specific time',
    {
      message: z.string().describe('Reminder message'),
      remind_at: z.string().describe('When to remind (ISO timestamp)'),
      channel_id: z.string().optional().describe('Channel to post reminder in'),
    },
    toolWrapper('create_reminder', async ({ message, remind_at, channel_id }: {
      message: string;
      remind_at: string;
      channel_id?: string;
    }) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ message, remind_at, channel_id, created: new Date().toISOString() }, null, 2),
          },
        ],
      };
    }),
  );
}