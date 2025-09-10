/**
 * SLACK CHANNEL TOOLS - MCP Tool Implementation
 * 
 * This file implements MCP tools for Slack channel operations. The tools allow
 * external AI agents to list available channels and retrieve detailed information
 * about specific channels. Each tool fetches data from the Slack API, persists
 * channel metadata to the database for caching/context, and returns simplified
 * JSON responses for AI consumption.
 * 
 * Tool Features:
 * - list_channels: Retrieves and caches all accessible channels
 * - get_channel_info: Fetches detailed metadata for a specific channel
 * 
 * Design Decisions:
 * - Data persistence: All channel data is stored in database for conversation context
 * - Response simplification: Maps complex Slack objects to essential fields for AI tools
 * - Error handling: Uses toolWrapper from ./errors.ts for consistent error management
 * - Input validation: Zod schemas ensure type safety for tool parameters
 * 
 * Dependencies:
 * - @modelcontextprotocol/sdk/server/mcp.js: MCP server and tool registration
 * - zod: Schema validation for tool inputs
 * - src/slack/client.ts: Slack API client for channel operations
 * - src/db/repository.ts: Database storage for channel metadata
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
 * Registers Slack channel-related tools with the MCP server.
 * 
 * This function registers two tools for channel operations:
 * 1. list_channels: Lists all accessible channels with basic info
 * 2. get_channel_info: Retrieves detailed metadata for a specific channel
 * 
 * Each tool uses the Slack API via slackClient, persists data to database,
 * and returns JSON-formatted responses. The toolWrapper provides error handling
 * and logging. See individual tool implementations for details.
 * 
 * @param {McpServer} server - The MCP server instance to register tools with
 * @returns {void}
 * 
 * @example
 * registerChannelTools(server);
 * // Registers 'list_channels' and 'get_channel_info' tools
 * 
 * // Usage by AI agent:
 * // await mcp.callTool('list_channels', {});
 * // await mcp.callTool('get_channel_info', { channel_id: 'C1234567890' });
 */
export function registerChannelTools(server: McpServer) {
  // Tool 1: List all accessible Slack channels
  // This tool provides workspace context for AI agents
  // No parameters required - fetches all bot-accessible channels
  server.tool(
    'list_channels',
    'List available Slack channels accessible by the bot. Returns channel IDs, names, privacy status, and member counts. Automatically caches channel data in the database for conversation context.',
    {},
    toolWrapper('list_channels', async () => {
      // Fetch all channels from Slack API
      // See: src/slack/client.ts#getChannels() for implementation details
      const channels = await slackClient.getChannels();

      // Persist each channel to database for caching and context
      // This enables conversation history and cross-tool data sharing
      // See: src/db/repository.ts#storeChannel() for storage logic
      for (const channel of channels) {
        await contextRepository.storeChannel(channel);
      }

      // Simplify channel objects for AI consumption
      // Maps complex Slack channel objects to essential fields only
      // Uses nullish coalescing (??) for safe property access
      const simplified = channels.map((c) => ({
        id: c.id ?? '',
        name: c.name ?? '',
        is_private: c.is_private ?? false,
        num_members: c.num_members ?? 0,
      }));

      // Return MCP-standard response format with JSON text content
      // The JSON string enables easy parsing by AI agents
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(simplified, null, 2),
          },
        ],
      };
    }),
  );

  // Tool 2: Get detailed information about a specific channel
  // This tool provides comprehensive metadata for channel analysis
  // Requires channel_id parameter for targeted information retrieval
  server.tool(
    'get_channel_info',
    'Get detailed information about a specific Slack channel including topic, purpose, member list, creation date, and other metadata. Automatically caches the channel data in the database.',
    {
      channel_id: z.string().describe('The ID of the channel to get detailed information for (e.g., "C1234567890")'),
    },
    toolWrapper('get_channel_info', async ({ channel_id }: { channel_id: string }) => {
      // Fetch detailed channel information from Slack API
      // Uses direct WebClient call for conversations.info (not wrapped in slackClient)
      // This provides more comprehensive metadata than the basic channel list
      const info = await slackClient.client.conversations.info({
        channel: channel_id,
      });

      // Persist channel data to database if successfully retrieved
      // This maintains consistency across tool usage and enables caching
      if (info.channel) {
        await contextRepository.storeChannel(info.channel);
      }

      // Return raw channel object as JSON for detailed analysis
      // Unlike list_channels, this preserves all Slack metadata fields
      // AI agents can use this for in-depth channel analysis and decision making
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(info.channel, null, 2),
          },
        ],
      };
    }),
  );
}
