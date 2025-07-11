import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';
import { toolWrapper } from './errors';

/**
 * Registers Slack channel-related tools with the MCP server.
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerChannelTools(server: McpServer) {
  server.tool(
    'list_channels',
    'List available Slack channels',
    {},
    toolWrapper('list_channels', async () => {
      const channels = await slackClient.getChannels();

      for (const channel of channels) {
        await contextRepository.storeChannel(channel);
      }

      const simplified = channels.map((c) => ({
        id: c.id ?? '',
        name: c.name ?? '',
        is_private: c.is_private ?? false,
        num_members: c.num_members ?? 0,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(simplified, null, 2),
          },
        ],
      };
    }),
  );

  server.tool(
    'get_channel_info',
    'Get detailed information about a Slack channel',
    {
      channel_id: z.string().describe('The ID of the channel to get info for'),
    },
    toolWrapper('get_channel_info', async ({ channel_id }: { channel_id: string }) => {
      const info = await slackClient.client.conversations.info({
        channel: channel_id,
      });

      if (info.channel) {
        await contextRepository.storeChannel(info.channel);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(info.channel, null, 2),
          },
        ],
      };
    }),
  );
}
