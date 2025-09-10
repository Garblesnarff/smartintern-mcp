import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolWrapper } from './errors';

export function registerMessageEnhancementTools(server: McpServer) {
  server.tool(
    'enhance_message',
    'Enhance a message with formatting and suggestions',
    {
      message: z.string().describe('Message to enhance'),
      style: z.enum(['professional', 'casual', 'technical']).optional().describe('Enhancement style'),
    },
    toolWrapper('enhance_message', async ({ message, style = 'professional' }: {
      message: string;
      style?: 'professional' | 'casual' | 'technical';
    }) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ original: message, enhanced: message, style }, null, 2),
          },
        ],
      };
    }),
  );
}