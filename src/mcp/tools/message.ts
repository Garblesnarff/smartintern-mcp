/**
 * MESSAGE TOOLS - Slack Message Operations
 * 
 * This file implements MCP tools for Slack message retrieval and posting.
 * The tools enable AI agents to fetch conversation history, retrieve thread
 * replies, and send messages to channels or threads. Each tool persists
 * retrieved messages to the database for conversation context and analysis.
 * 
 * Tool Features:
 * - get_channel_history: Retrieves recent messages from a channel with configurable limit
 * - get_thread_replies: Fetches all replies in a specific message thread
 * - send_message: Posts messages to channels or as thread replies
 * 
 * Design Decisions:
 * - Conversation persistence: All retrieved messages stored in database for context
 * - Batch storage: Processes multiple messages efficiently with bulk operations
 * - Thread support: Handles both channel-level and thread-level message retrieval
 * - Response consistency: Returns raw Slack message objects as JSON for analysis
 * - Error handling: Uses toolWrapper for standardized error management
 * 
 * Dependencies:
 * - @modelcontextprotocol/sdk/server/mcp.js: MCP server and tool registration
 * - zod: Schema validation for tool inputs
 * - src/slack/client.ts: Slack API methods for message operations
 * - src/db/repository.ts: Database storage for messages and channels
 * - ./errors.ts: toolWrapper for error handling and logging
 * 
 * @author Cline (built by Oak AI)
 */

// ====================================
// Imports
// ====================================
// MCP SDK imports
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Validation and utilities
import { z } from 'zod';

// Project modules
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';
import { toolWrapper } from './errors';

/**
 * Registers Slack message-related tools with the MCP server.
 * 
 * This function registers three essential tools for message operations:
 * 1. get_channel_history: Fetches recent messages from a channel (supports pagination)
 * 2. get_thread_replies: Retrieves all replies in a specific message thread
 * 3. send_message: Posts messages to channels or as thread replies
 * 
 * Each tool integrates Slack API calls with database persistence for conversation
 * context. Retrieved messages are stored for analysis, and sent messages return
 * the Slack API response for tracking. Zod schemas validate all tool parameters.
 * 
 * @param {McpServer} server - The MCP server instance to register tools with
 * @returns {void}
 * 
 * @example
 * registerMessageTools(server);
 * // Registers 'get_channel_history', 'get_thread_replies', and 'send_message'
 * 
 * // Usage examples:
 * // await mcp.callTool('get_channel_history', { channel_id: 'C123', limit: 50 });
 * // await mcp.callTool('get_thread_replies', { channel_id: 'C123', thread_ts: '1234567890.123456' });
 * // await mcp.callTool('send_message', { channel_id: 'C123', text: 'Hello from MCP!' });
 */
export function registerMessageTools(server: McpServer) {
  // Tool 1: Retrieve recent messages from a Slack channel
  // This tool provides conversation context for AI analysis and supports pagination
  server.tool(
    'get_channel_history',
    'Retrieve recent messages from a Slack channel. Automatically persists messages to the database for conversation context and analysis. Supports configurable message limits for performance control.',
    {
      channel_id: z.string().describe('The Slack channel ID to retrieve messages from (e.g., "C1234567890")'),
      limit: z.number().optional().describe('Maximum number of recent messages to retrieve (default: 100, max: 1000 per Slack API limits)'),
    },
    toolWrapper(
      'get_channel_history',
      async ({ channel_id, limit = 100 }: { channel_id: string; limit?: number }) => {
        // Fetch message history from Slack API
        // See: src/slack/client.ts#getChannelHistory() for implementation details
        // This respects Slack's rate limits and pagination constraints
        const messages = await slackClient.getChannelHistory(channel_id, limit);

        // Ensure channel exists in database before storing messages
        // Uses placeholder data since channel details aren't fetched here
        // In production, this could be enhanced with channel info retrieval
        // See: src/db/repository.ts#storeChannel() for storage logic
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: '',
          is_private: false,
        });

        // Persist each message to database for conversation analysis
        // This enables cross-tool conversation context and historical analysis
        // Messages are stored with timestamps converted to Date objects
        // See: src/db/repository.ts#storeMessage() for detailed storage logic
        for (const message of messages) {
          await contextRepository.storeMessage(message, channelResult.id);
        }

        // Return raw Slack message objects as JSON
        // AI agents can analyze message content, timestamps, users, attachments, etc.
        // The full message structure preserves all Slack metadata for comprehensive analysis
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(messages, null, 2),
            },
          ],
        };
      },
    ),
  );

  // Tool 2: Retrieve all replies in a specific message thread
  // This tool enables thread-level conversation analysis and follow-up tracking
  server.tool(
    'get_thread_replies',
    'Retrieve all replies in a specific Slack message thread. Includes the parent message and all threaded replies. Automatically persists all messages to the database for conversation context.',
    {
      channel_id: z.string().describe('The Slack channel ID containing the thread (e.g., "C1234567890")'),
      thread_ts: z.string().describe('The parent message timestamp identifying the thread (e.g., "1234567890.123456")'),
    },
    toolWrapper(
      'get_thread_replies',
      async ({ channel_id, thread_ts }: { channel_id: string; thread_ts: string }) => {
        // Fetch thread replies from Slack API including parent message
        // This provides complete thread context for conversation analysis
        // See: src/slack/client.ts#getThreadReplies() for implementation details
        const replies = await slackClient.getThreadReplies(channel_id, thread_ts);

        // Ensure channel exists in database before storing thread messages
        // Placeholder data used; could be enhanced with actual channel info
        // See: src/db/repository.ts#storeChannel() for storage logic
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: '',
          is_private: false,
        });

        // Persist all thread messages (including parent) to database
        // This maintains complete conversation history for threaded discussions
        // Thread_ts field links replies to their parent message
        // See: src/db/repository.ts#storeMessage() for detailed storage logic
        for (const message of replies) {
          await contextRepository.storeMessage(message, channelResult.id);
        }

        // Return complete thread as JSON array
        // Includes parent message first, followed by all replies in chronological order
        // AI agents can analyze discussion flow, identify key contributors, and track follow-ups
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(replies, null, 2),
            },
          ],
        };
      },
    ),
  );

  // Tool 3: Send messages to Slack channels or threads
  // This tool enables AI agents to communicate with users and post generated content
  server.tool(
    'send_message',
    'Send a message to a Slack channel or as a reply in a thread. Returns the posted message details including timestamp for future reference.',
    {
      channel_id: z.string().describe('The Slack channel ID to send the message to (e.g., "C1234567890")'),
      text: z.string().describe('The message content to send. Supports Slack markdown formatting.'),
      thread_ts: z.string().optional().describe('Optional thread timestamp to post as a reply (e.g., "1234567890.123456"). If provided, message posts as thread reply.'),
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
        // Post message to Slack using the provided parameters
        // Supports both channel messages and thread replies
        // See: src/slack/client.ts#postMessage() for implementation details
        // This handles Slack's formatting, rate limits, and error conditions
        const result = await slackClient.postMessage(channel_id, text, thread_ts);

        // Return the complete Slack API response
        // Includes message timestamp (ts), channel ID, and other metadata
        // The ts can be used for future thread replies or message referencing
        // AI agents can track sent messages and build conversation state
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    ),
  );
}
