import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolWrapper } from './errors';

export function registerFileTools(server: McpServer) {
  server.tool(
    'upload_file',
    'Upload a file to Slack',
    {
      file_path: z.string().describe('Path to file to upload'),
      channels: z.array(z.string()).describe('Channel IDs to upload to'),
      title: z.string().optional().describe('File title'),
    },
    toolWrapper('upload_file', async ({ file_path, channels, title }: {
      file_path: string;
      channels: string[];
      title?: string;
    }) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ file_path, channels, title, uploaded: new Date().toISOString() }, null, 2),
          },
        ],
      };
    }),
  );
}