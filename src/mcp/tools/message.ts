import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';

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
    async ({
      channel_id,
      limit = 100,
    }: {
      channel_id: string;
      limit?: number;
    }) => {
      try {
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
      } catch (error) {
        console.error(`Error in get_channel_history tool for ${channel_id}:`, error);
        if (error instanceof Error) {
          throw new Error('Failed to get channel history: ' + error.message);
        } else {
          throw new Error('Failed to get channel history: ' + String(error));
        }
      }
    }
  );

  server.tool(
    'get_thread_replies',
    'Get replies in a Slack thread',
    {
      channel_id: z.string().describe('The ID of the channel'),
      thread_ts: z.string().describe('Parent message timestamp'),
    },
    async ({
      channel_id,
      thread_ts,
    }: {
      channel_id: string;
      thread_ts: string;
    }) => {
      try {
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
      } catch (error) {
        console.error(
          `Error in get_thread_replies tool for ${channel_id}/${thread_ts}:`,
          error
        );
        if (error instanceof Error) {
          throw new Error('Failed to get thread replies: ' + error.message);
        } else {
          throw new Error('Failed to get thread replies: ' + String(error));
        }
      }
    }
  );

  server.tool(
    'send_message',
    'Send a message to a Slack channel',
    {
      channel_id: z.string().describe('The ID of the channel'),
      text: z.string().describe('Message text'),
      thread_ts: z.string().optional().describe('Optional thread timestamp'),
    },
    async ({
      channel_id,
      text,
      thread_ts,
    }: {
      channel_id: string;
      text: string;
      thread_ts?: string;
    }) => {
      try {
        const result = await slackClient.postMessage(
          channel_id,
          text,
          thread_ts
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`Error in send_message tool for ${channel_id}:`, error);
        if (error instanceof Error) {
          throw new Error('Failed to send message: ' + error.message);
        } else {
          throw new Error('Failed to send message: ' + String(error));
        }
      }
    }
  );
}
