import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';
import { toolWrapper } from './errors';

/**
 * Registers Slack message-related tools with the MCP server.
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerMessageTools(server: McpServer) {
  server.tool(
    'get_channel_history',
    'Get recent messages from a Slack channel',
    {
      channel_id: z.string().describe('The ID of the channel'),
      limit: z.number().optional().describe('Max number of messages'),
    },
    toolWrapper(
      'get_channel_history',
      async ({ channel_id, limit = 100 }: { channel_id: string; limit?: number }) => {
        const messages = await slackClient.getChannelHistory(channel_id, limit);

        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: '',
          is_private: false,
        });

        for (const message of messages) {
          await contextRepository.storeMessage(message, channelResult.id);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(messages, null, 2),
            },
          ],
        };
      },
    ),
  );

  server.tool(
    'get_thread_replies',
    'Get replies in a Slack thread',
    {
      channel_id: z.string().describe('The ID of the channel'),
      thread_ts: z.string().describe('Parent message timestamp'),
    },
    toolWrapper(
      'get_thread_replies',
      async ({ channel_id, thread_ts }: { channel_id: string; thread_ts: string }) => {
        const replies = await slackClient.getThreadReplies(channel_id, thread_ts);

        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: '',
          is_private: false,
        });

        for (const message of replies) {
          await contextRepository.storeMessage(message, channelResult.id);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(replies, null, 2),
            },
          ],
        };
      },
    ),
  );

  server.tool(
    'send_message',
    'Send a message to a Slack channel',
    {
      channel_id: z.string().describe('The ID of the channel'),
      text: z.string().describe('Message text'),
      thread_ts: z.string().optional().describe('Optional thread timestamp'),
    },
    toolWrapper(
      'send_message',
      async ({
        channel_id,
        text,
        thread_ts,
      }: {
        channel_id: string;
        text: string;
        thread_ts?: string;
      }) => {
        const result = await slackClient.postMessage(channel_id, text, thread_ts);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    ),
  );
}
