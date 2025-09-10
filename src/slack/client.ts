/**
 * SLACK CLIENT - API Integration Layer
 * 
 * This file implements the Slack API client for the SmartIntern MCP server.
 * The SlackClient class provides methods for fetching channels, messages,
 * thread replies, user information, and posting messages. It uses the official
 * @slack/web-api package and authenticates using the bot token from configuration.
 * All methods include error handling and logging for debugging.
 * 
 * Design Decisions:
 * - Singleton pattern: One client instance shared across the application
 * - Error propagation: Logs errors but re-throws for upstream handling
 * - Default parameters: Sensible defaults for common operations (e.g., message limit)
 * - Type safety: Uses Slack's WebClient with TypeScript for API method safety
 * 
 * Dependencies:
 * - @slack/web-api: Official Slack SDK for Node.js
 * - src/config.ts: Slack bot token and other credentials
 * 
 * @author Cline (built by Oak AI)
 */

// ====================================
// Imports
// ====================================
import { WebClient } from '@slack/web-api';
import { config } from '../config';

/**
 * Slack API client class for workspace interactions.
 * 
 * This class wraps the Slack WebClient and provides high-level methods for
 * common operations used by MCP tools: channel listing, message history,
 * thread replies, user info, and message posting. The constructor initializes
 * the WebClient with the bot token from configuration.
 * 
 * Why Singleton? A single client instance manages authentication and rate limiting
 * efficiently across all tool operations. Multiple instances could lead to
 * token management issues and unnecessary API overhead.
 * 
 * @property {WebClient} client - Underlying Slack WebClient instance
 */
export class SlackClient {
  client: WebClient;

  /**
   * Initializes the Slack client with bot token authentication.
   * 
   * Creates a new WebClient instance using the bot token from environment config.
   * The bot must have appropriate scopes (channels:read, chat:write, etc.) for
   * the operations performed by this client.
   * 
   * @throws {Error} If SLACK_BOT_TOKEN is missing (validated in config.ts)
   */
  constructor() {
    this.client = new WebClient(config.slack.botToken);
  }

  /**
   * Retrieves a list of accessible Slack channels.
   * 
   * This method fetches public and private channels the bot has access to,
   * excluding archived channels. Useful for MCP tools that need workspace context.
   * 
   * API Reference: conversations.list
   * 
   * @returns {Promise<Array>} Array of channel objects with id, name, is_private, etc.
   * @throws {Error} If Slack API call fails (e.g., invalid token, rate limit)
   * 
   * @example
   * const channels = await getChannels();
   * // Returns [{ id: 'C123', name: 'general', is_private: false }, ...]
   */
  async getChannels() {
    try {
      // Fetch channels with filters for active public/private channels only
      // This provides workspace context for MCP tools
      const result = await this.client.conversations.list({
        exclude_archived: true,
        types: 'public_channel,private_channel',
      });
      return result.channels || [];
    } catch (error) {
      // Log for debugging, re-throw for tool error handling
      console.error('Error fetching channels:', error);
      throw error;
    }
  }

  /**
   * Retrieves message history from a specific channel.
   * 
   * This method fetches recent messages from a channel, useful for conversation
   * analysis and context retrieval in MCP tools. Supports pagination via limit.
   * 
   * API Reference: conversations.history
   * 
   * @param {string} channelId - Slack channel ID (e.g., 'C1234567890')
   * @param {number} [limit=100] - Maximum number of messages to retrieve
   * @returns {Promise<Array>} Array of message objects with ts, user, text, etc.
   * @throws {Error} If Slack API call fails or channel access denied
   * 
   * @example
   * const messages = await getChannelHistory('C1234567890', 50);
   * // Returns recent 50 messages from the channel
   */
  async getChannelHistory(channelId: string, limit = 100) {
    try {
      // Fetch message history with configurable limit for performance
      // This supports conversation context for AI analysis tools
      const result = await this.client.conversations.history({
        channel: channelId,
        limit,
      });
      return result.messages || [];
    } catch (error) {
      console.error(`Error fetching history for channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves replies in a specific Slack thread.
   * 
   * This method fetches all replies to a parent message in a thread, useful for
   * conversation threading and follow-up analysis in MCP tools.
   * 
   * API Reference: conversations.replies
   * 
   * @param {string} channelId - Slack channel ID containing the thread
   * @param {string} threadTs - Parent message timestamp (ts) for the thread
   * @returns {Promise<Array>} Array of reply message objects
   * @throws {Error} If Slack API call fails or thread not found
   * 
   * @example
   * const replies = await getThreadReplies('C1234567890', '1234567890.123456');
   * // Returns all replies in the specified thread
   */
  async getThreadReplies(channelId: string, threadTs: string) {
    try {
      // Fetch thread replies for conversation threading analysis
      // This helps MCP tools understand discussion context and follow-ups
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
      });
      return result.messages || [];
    } catch (error) {
      console.error(`Error fetching thread replies for ${channelId}/${threadTs}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves information about a specific Slack user.
   * 
   * This method fetches user profile details, useful for assignee information
   * in action items or participant details in meeting notes.
   * 
   * API Reference: users.info
   * 
   * @param {string} userId - Slack user ID (e.g., 'U1234567890')
   * @returns {Promise<Object>} User object with id, name, profile, etc.
   * @throws {Error} If Slack API call fails or user not found
   * 
   * @example
   * const user = await getUserInfo('U1234567890');
   * // Returns { id: 'U123', name: 'john.doe', profile: { ... } }
   */
  async getUserInfo(userId: string) {
    try {
      // Fetch user profile for assignee tracking and participant info
      // This supports personalized action items and meeting summaries
      const result = await this.client.users.info({
        user: userId,
      });
      return result.user;
    } catch (error) {
      console.error(`Error fetching user info for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Posts a message to a Slack channel or thread.
   * 
   * This method sends messages to channels or as thread replies, useful for
   * MCP tools that need to respond to users or post generated content
   * (e.g., meeting summaries, action item updates).
   * 
   * API Reference: chat.postMessage
   * 
   * @param {string} channelId - Slack channel ID to post to
   * @param {string} text - Message content to send
   * @param {string} [threadTs] - Optional thread timestamp for reply threading
   * @returns {Promise<Object>} API response with message details (ts, channel, etc.)
   * @throws {Error} If Slack API call fails or posting permissions denied
   * 
   * @example
   * const result = await postMessage('C1234567890', 'Hello, world!');
   * // Posts message to channel
   * 
   * const reply = await postMessage('C1234567890', 'Follow-up', '1234567890.123456');
   * // Posts as thread reply
   */
  async postMessage(channelId: string, text: string, threadTs?: string) {
    try {
      // Post message with optional thread reply support
      // This enables conversational responses from MCP tools
      const result = await this.client.chat.postMessage({
        channel: channelId,
        text,
        thread_ts: threadTs,
      });
      return result;
    } catch (error) {
      console.error(`Error posting message to ${channelId}:`, error);
      throw error;
    }
  }
}

// ====================================
// Singleton Instance
// ====================================

// Export a singleton instance of the Slack client
// This ensures single authentication context and efficient rate limiting
// Multiple instances would create unnecessary API overhead and token management
export const slackClient = new SlackClient();
