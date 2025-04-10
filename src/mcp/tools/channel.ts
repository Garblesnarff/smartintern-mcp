import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';

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
    async () => {
      try {
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
      } catch (error) {
        console.error('Error in list_channels tool:', error);
        if (error instanceof Error) {
          throw new Error('Failed to list channels: ' + error.message);
        } else {
          throw new Error('Failed to list channels: ' + String(error));
        }
      }
    }
  );

  server.tool(
    'get_channel_info',
    'Get detailed information about a Slack channel',
    {
      channel_id: z.string().describe('The ID of the channel to get info for'),
    },
    async ({ channel_id }: { channel_id: string }) => {
      try {
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
      } catch (error) {
        console.error(`Error in get_channel_info tool for ${channel_id}:`, error);
        if (error instanceof Error) {
          throw new Error('Failed to get channel info: ' + error.message);
        } else {
          throw new Error('Failed to get channel info: ' + String(error));
        }
      }
    }
  );
}
