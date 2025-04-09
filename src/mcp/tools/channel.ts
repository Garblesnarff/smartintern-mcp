import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';

export function registerChannelTools(server: McpServer) {
  server.tool({
    name: 'list_channels',
    description: 'List available Slack channels',
    parameters: {},
    handler: async () => {
      try {
        const channels = await slackClient.getChannels();
        
        // Store channels in database
        for (const channel of channels) {
          await contextRepository.storeChannel(channel);
        }
        
        return channels.map(c => ({
          id: c.id,
          name: c.name,
          is_private: c.is_private,
          num_members: c.num_members
        }));
      } catch (error) {
        console.error('Error in list_channels tool:', error);
        throw new Error('Failed to list channels: ' + error.message);
      }
    }
  });

  server.tool({
    name: 'get_channel_info',
    description: 'Get detailed information about a Slack channel',
    parameters: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'The ID of the channel to get info for'
        }
      },
      required: ['channel_id']
    },
    handler: async ({ channel_id }) => {
      try {
        const info = await slackClient.client.conversations.info({
          channel: channel_id
        });
        
        if (info.channel) {
          await contextRepository.storeChannel(info.channel);
        }
        
        return info.channel;
      } catch (error) {
        console.error(`Error in get_channel_info tool for ${channel_id}:`, error);
        throw new Error('Failed to get channel info: ' + error.message);
      }
    }
  });
}
