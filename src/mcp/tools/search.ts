import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolWrapper } from './errors';

export function registerSearchTools(server: McpServer) {
  server.tool(
    'search_messages',
    'Search for messages in Slack channels',
    {
      query: z.string().describe('Search query'),
      channel_id: z.string().optional().describe('Channel to search in'),
      from_date: z.string().optional().describe('Start date for search'),
      to_date: z.string().optional().describe('End date for search'),
    },
    toolWrapper('search_messages', async ({ query, channel_id, from_date, to_date }: {
      query: string;
      channel_id?: string;
      from_date?: string;
      to_date?: string;
    }) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ query, channel_id, from_date, to_date, results: [] }, null, 2),
          },
        ],
      };
    }),
  );
}