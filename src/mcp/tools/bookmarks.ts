import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolWrapper } from './errors';

export function registerBookmarkTools(server: McpServer) {
  server.tool(
    'create_bookmark',
    'Create a bookmark for a message or resource',
    {
      url: z.string().describe('URL to bookmark'),
      title: z.string().describe('Bookmark title'),
      tags: z.array(z.string()).optional().describe('Bookmark tags'),
    },
    toolWrapper('create_bookmark', async ({ url, title, tags = [] }: {
      url: string;
      title: string;
      tags?: string[];
    }) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ url, title, tags, created: new Date().toISOString() }, null, 2),
          },
        ],
      };
    }),
  );
}