import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';

export function registerMessageTools(server: McpServer) {
  server.tool({
    name: 'get_channel_history',
    description: 'Get recent messages from a Slack channel',
    parameters: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'The ID of the channel to get history for'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to retrieve (defaults to 100)',
          default: 100
        }
      },
      required: ['channel_id']
    },
    handler: async ({ channel_id, limit = 100 }) => {
      try {
        const messages = await slackClient.getChannelHistory(channel_id, limit);
        
        // Get channel ID from database
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: '', // Will be updated from Slack if needed
          is_private: false // Will be updated from Slack if needed
        });
        
        // Store messages in database
        for (const message of messages) {
          await contextRepository.storeMessage(message, channelResult.id);
        }
        
        return messages;
      } catch (error) {
        console.error(`Error in get_channel_history tool for ${channel_id}:`, error);
        throw new Error('Failed to get channel history: ' + error.message);
      }
    }
  });

  server.tool({
    name: 'get_thread_replies',
    description: 'Get replies in a threaded Slack conversation',
    parameters: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'The ID of the channel containing the thread'
        },
        thread_ts: {
          type: 'string',
          description: 'The timestamp of the parent message of the thread'
        }
      },
      required: ['channel_id', 'thread_ts']
    },
    handler: async ({ channel_id, thread_ts }) => {
      try {
        const replies = await slackClient.getThreadReplies(channel_id, thread_ts);
        
        // Get channel ID from database
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: '', // Will be updated from Slack if needed
          is_private: false // Will be updated from Slack if needed
        });
        
        // Store messages in database
        for (const message of replies) {
          await contextRepository.storeMessage(message, channelResult.id);
        }
        
        return replies;
      } catch (error) {
        console.error(`Error in get_thread_replies tool for ${channel_id}/${thread_ts}:`, error);
        throw new Error('Failed to get thread replies: ' + error.message);
      }
    }
  });

  server.tool({
    name: 'send_message',
    description: 'Send a message to a Slack channel',
    parameters: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'The ID of the channel to send the message to'
        },
        text: {
          type: 'string',
          description: 'The text content of the message'
        },
        thread_ts: {
          type: 'string',
          description: 'Optional thread timestamp to reply to a thread',
          default: undefined
        }
      },
      required: ['channel_id', 'text']
    },
    handler: async ({ channel_id, text, thread_ts }) => {
      try {
        const result = await slackClient.postMessage(channel_id, text, thread_ts);
        return result;
      } catch (error) {
        console.error(`Error in send_message tool for ${channel_id}:`, error);
        throw new Error('Failed to send message: ' + error.message);
      }
    }
  });
}
