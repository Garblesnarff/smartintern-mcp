/**
 * MEETING NOTES TOOLS - AI-Assisted Meeting Analysis
 * 
 * This file implements MCP tools for automatic meeting note generation and
 * action item extraction from Slack conversations. The tools analyze message
 * content using pattern matching to identify participants, action items, and
 * decisions, then generate formatted summaries and persist structured data
 * to the database for tracking and follow-up.
 * 
 * Tool Features:
 * - create_meeting_notes: Generates complete meeting summaries with participant lists, action items, and decisions
 * - extract_action_items: Identifies and extracts action items from conversation timeframes with assignee detection
 * 
 * Design Decisions:
 * - Pattern-based analysis: Uses regex and keyword matching for action item/decision detection
 * - Time-based filtering: Filters messages by timestamp range for precise meeting scope
 * - Participant resolution: Resolves user IDs to display names for readable summaries
 * - Structured storage: Persists extracted data as JSONB for flexible querying and analysis
 * - Optional posting: Configurable whether to post summaries back to Slack channels
 * 
 * Dependencies:
 * - @modelcontextprotocol/sdk/server/mcp.js: MCP server and tool registration
 * - zod: Schema validation for tool inputs
 * - src/slack/client.ts: Slack API for message retrieval and user info
 * - src/db/repository.ts: Database storage for meeting notes and action items
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
 * Registers meeting notes and action item extraction tools with the MCP server.
 * 
 * This function registers two AI-assisted analysis tools:
 * 1. create_meeting_notes: Generates comprehensive meeting summaries from conversation timeframes
 * 2. extract_action_items: Identifies and extracts actionable tasks with assignee detection
 * 
 * The tools use pattern matching and natural language heuristics to analyze Slack
 * messages, identify participants, extract action items and decisions, and generate
 * formatted summaries. Extracted data is persisted to the database for tracking.
 * 
 * @param {McpServer} server - The MCP server instance to register tools with
 * @returns {void}
 * 
 * @example
 * registerNoteTools(server);
 * // Registers 'create_meeting_notes' and 'extract_action_items'
 * 
 * // Usage examples:
 * // await mcp.callTool('create_meeting_notes', { 
 * //   channel_id: 'C123', start_ts: '1234567890.000000', 
 * //   end_ts: '1234567890.999999', title: 'Weekly Standup' 
 * // });
 * // await mcp.callTool('extract_action_items', { 
 * //   channel_id: 'C123', start_ts: '1234567890.000000', 
 * //   post_summary: true 
 * // });
 */
export function registerNoteTools(server: McpServer) {
  // Tool 1: Generate comprehensive meeting notes from conversation timeframe
  // This tool performs complete meeting analysis including participant identification,
  // action item extraction, decision tracking, and formatted summary generation
  server.tool(
    'create_meeting_notes',
    'Analyze a Slack conversation timeframe to generate comprehensive meeting notes including participant list, discussion summary, extracted action items, and identified decisions. Optionally posts the formatted summary to the channel.',
    {
      channel_id: z.string().describe('The Slack channel ID where the meeting conversation occurred (e.g., "C1234567890")'),
      start_ts: z.string().describe('Meeting start timestamp in Slack format (Unix timestamp with microseconds, e.g., "1234567890.000000")'),
      end_ts: z.string().describe('Meeting end timestamp in Slack format (Unix timestamp with microseconds, e.g., "1234567890.999999")'),
      title: z.string().describe('Descriptive title for the meeting notes (e.g., "Q3 Planning Meeting")'),
      post_to_channel: z.boolean().optional().describe('Whether to post the generated meeting notes back to the original channel (default: true)'),
    },
    toolWrapper(
      'create_meeting_notes',
      async ({
        channel_id,
        start_ts,
        end_ts,
        title,
        post_to_channel = true,
      }: {
        channel_id: string;
        start_ts: string;
        end_ts: string;
        title: string;
        post_to_channel?: boolean;
      }) => {
        // Fetch channel metadata for summary context and database storage
        // This provides channel name and privacy status for the meeting notes
        const channelInfo = await slackClient.client.conversations.info({
          channel: channel_id,
        });

        // Retrieve recent channel history (up to 1000 messages)
        // This provides the conversation corpus for meeting analysis
        // See: src/slack/client.ts#getChannelHistory() for implementation
        const allMessages = await slackClient.getChannelHistory(channel_id, 1000);

        // Filter messages to the specified meeting timeframe using timestamp comparison
        // Converts Slack timestamps (with microseconds) to numbers for range filtering
        // This ensures only relevant meeting conversation is analyzed
        const meetingMessages = allMessages.filter((msg) => {
          const ts = msg.ts ? parseFloat(msg.ts) : 0;
          return ts >= parseFloat(start_ts) && ts <= parseFloat(end_ts);
        });

        // Validate that meeting timeframe contains conversation
        // Prevents processing empty time ranges or invalid timestamps
        if (meetingMessages.length === 0) {
          throw new Error('No messages found in the specified time range');
        }

        // Extract unique participant IDs from meeting messages
        // Uses Set to eliminate duplicates and ensure each participant is counted once
        const participantIds = [...new Set(meetingMessages.map((msg) => msg.user))];

        // Resolve participant IDs to human-readable names using parallel API calls
        // Fetches user profiles and prefers real_name over username for display
        // Handles missing user IDs gracefully with fallback to 'Unknown'
        const participants = await Promise.all(
          participantIds.map(async (id) => {
            if (!id) return 'Unknown';
            // Fetch user profile for display name resolution
            // See: src/slack/client.ts#getUserInfo() for implementation
            const user = await slackClient.getUserInfo(id);
            return user?.real_name || user?.name || id;
          }),
        );

        // Initialize arrays for extracted action items and decisions
        const actionItems: any[] = [];
        const decisions: any[] = [];

        // Analyze each meeting message for action items and decisions using pattern matching
        for (const msg of meetingMessages) {
          // Convert message text to lowercase for case-insensitive keyword matching
          const text = (msg.text ?? '').toLowerCase();

          // Action item detection patterns:
          // 1. Explicit keywords: "action item", "todo"
          // 2. Obligation patterns: "will/should/need to/must" following @mentions
          // This heuristic identifies tasks and responsibilities in natural language
          if (
            text.includes('action item') ||
            text.includes('todo') ||
            (msg.text ?? '').match(/(?:@\w+|<@[^>]+>).*\b(?:will|should|needs? to|must)\b/i)
          ) {
            // Extract action item with message content as description and user as assignee
            // Simple heuristic: assumes message author is responsible unless @mentioned
            actionItems.push({
              description: msg.text ?? '',
              assignee: msg.user,
            });
          }

          // Decision detection patterns:
          // Keywords indicating conclusions or agreements in meetings
          // These patterns identify key outcomes and consensus points
          if (
            text.includes('decided') ||
            text.includes('decision') ||
            text.includes('conclude') ||
            text.includes('agreement')
          ) {
            // Capture decision context with message text and author
            decisions.push({
              text: msg.text ?? '',
              user: msg.user,
            });
          }
        }

        // Generate formatted meeting summary using Slack markdown
        // Includes channel context, participant list, message count, action items, and decisions
        // Uses template literals for structured, readable output
        const summary =
          `Meeting in #${channelInfo.channel?.name || channel_id}\n\n` +
          `**Participants:** ${participants.join(', ')}\n\n` +
          `**Discussion Summary:**\n` +
          `Meeting started at ${new Date(parseFloat(start_ts) * 1000).toLocaleString()}\n` +
          `${meetingMessages.length} messages exchanged\n\n` +
          `**Action Items:**\n` +
          (actionItems.length > 0
            ? actionItems.map((item) => `- ${item.description}`).join('\n')
            : '- None identified') +
          `\n\n**Decisions:**\n` +
          (decisions.length > 0
            ? decisions.map((d) => `- ${d.text}`).join('\n')
            : '- None identified');

        // Ensure channel is stored in database before creating meeting notes
        // This maintains referential integrity for foreign key relationships
        // See: src/db/repository.ts#storeChannel() for implementation
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: channelInfo.channel?.name || '',
          is_private: channelInfo.channel?.is_private || false,
        });

        // Prepare structured meeting notes data for database storage
        // Includes title, generated summary, timestamps, participants, and extracted items
        const meetingNotes = {
          title,
          summary,
          start_ts,
          end_ts,
          participants,
          action_items: actionItems,
          decisions,
        };

        // Persist meeting notes to database as JSONB for flexible querying
        // This enables later retrieval and analysis of meeting outcomes
        // See: src/db/repository.ts#storeMeetingNotes() for storage logic
        await contextRepository.storeMeetingNotes(meetingNotes, channelResult.id);

        // Optionally post the formatted summary to the original channel
        // This provides immediate visibility to meeting participants
        // Uses Slack markdown for rich formatting (bold headers, bullet points)
        if (post_to_channel) {
          await slackClient.postMessage(channel_id, `*${title} - Meeting Notes*\n\n${summary}`);
        }

        // Create individual action items in database for tracking and follow-up
        // Each extracted action item becomes a trackable database record
        // See: src/db/repository.ts#storeActionItem() for individual item storage
        for (const item of actionItems) {
          await contextRepository.storeActionItem(item, channelResult.id);
        }

        // Return comprehensive meeting analysis results
        // Includes generated content and metadata for AI agent verification
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  title,
                  summary,
                  participants,
                  action_items: actionItems,
                  decisions,
                  posted: post_to_channel,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    ),
  );

  // Tool 2: Extract action items from conversation timeframe using pattern matching
  // This focused tool identifies only actionable tasks without full meeting analysis
  server.tool(
    'extract_action_items',
    'Scan a Slack conversation timeframe to identify and extract action items using natural language pattern matching. Supports assignee detection from @mentions and posts optional summary to channel.',
    {
      channel_id: z.string().describe('The Slack channel ID to analyze for action items (e.g., "C1234567890")'),
      start_ts: z.string().optional().describe('Optional start timestamp for analysis timeframe (default: beginning of conversation history)'),
      end_ts: z.string().optional().describe('Optional end timestamp for analysis timeframe (default: current time)'),
      post_summary: z.boolean().optional().describe('Whether to post extracted action items summary to the channel (default: false)'),
    },
    toolWrapper(
      'extract_action_items',
      async ({
        channel_id,
        start_ts = '0',
        end_ts = String(Date.now() / 1000),
        post_summary = false,
      }: {
        channel_id: string;
        start_ts?: string;
        end_ts?: string;
        post_summary?: boolean;
      }) => {
        // Fetch channel metadata for database storage and summary context
        // This provides channel name for action item tracking
        const channelInfo = await slackClient.client.conversations.info({
          channel: channel_id,
        });

        // Retrieve conversation history for analysis (up to 1000 recent messages)
        // This provides the text corpus for action item pattern matching
        // See: src/slack/client.ts#getChannelHistory() for implementation
        const allMessages = await slackClient.getChannelHistory(channel_id, 1000);

        // Filter messages to the specified timeframe (defaults to all history if not provided)
        // Uses timestamp comparison to focus analysis on relevant conversation period
        const timeframeMessages = allMessages.filter((msg) => {
          const ts = msg.ts ? parseFloat(msg.ts) : 0;
          return ts >= parseFloat(start_ts) && ts <= parseFloat(end_ts);
        });

        // Validate that timeframe contains conversation for analysis
        // Prevents processing empty ranges or invalid timestamps
        if (timeframeMessages.length === 0) {
          throw new Error('No messages found in the specified time range');
        }

        // Initialize array for extracted action items
        const actionItems: any[] = [];

        // Analyze each message in timeframe using action item detection patterns
        for (const msg of timeframeMessages) {
          // Convert text to lowercase for case-insensitive pattern matching
          const text = (msg.text ?? '').toLowerCase();

          // Action item detection using multiple heuristics:
          // 1. Explicit keywords: "action item", "todo"
          // 2. Obligation patterns with @mentions: "should/will/need to" following user mentions
          // This identifies both explicit tasks and implicit responsibilities
          if (
            text.includes('action item') ||
            text.includes('todo') ||
            (msg.text ?? '').match(/(?:@\w+|<@[^>]+>).*\b(?:will|should|needs? to|must)\b/i)
          ) {
            // Extract @mention from message text to identify assignee
            // Uses regex to capture user ID from Slack mention format <@U1234567890>
            // Falls back to message author if no explicit mention found
            const mentionMatch = (msg.text ?? '').match(/<@([A-Z0-9]+)>/);
            const assigneeId = mentionMatch ? mentionMatch[1] : msg.user;

            // Create structured action item record
            // Includes full message text as description, detected assignee, and timestamp reference
            actionItems.push({
              description: msg.text ?? '',
              assignee: assigneeId,
              message_ts: msg.ts,
            });
          }
        }

        // Ensure channel is stored in database before creating action items
        // This maintains referential integrity for foreign key relationships
        // See: src/db/repository.ts#storeChannel() for implementation
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: channelInfo.channel?.name || '',
          is_private: channelInfo.channel?.is_private || false,
        });

        // Persist each extracted action item to database for tracking
        // This enables follow-up tools to manage and monitor the identified tasks
        // See: src/db/repository.ts#storeActionItem() for individual item storage
        for (const item of actionItems) {
          await contextRepository.storeActionItem(item, channelResult.id);
        }

        // Optionally post summary of extracted action items to channel
        // Creates formatted list with descriptions and assignee mentions
        // Only posts if action items were found and post_summary is true
        if (post_summary && actionItems.length > 0) {
          // Generate formatted summary using Slack markdown
          // Uses bullet points and italic formatting for assignee information
          const summary =
            `*Action Items Extracted:*\n\n` +
            actionItems
              .map((item) => `• ${item.description}\n   _Assigned to: <@${item.assignee}>_`)
              .join('\n\n');

          // Post summary to original channel for team visibility
          // See: src/slack/client.ts#postMessage() for implementation
          await slackClient.postMessage(channel_id, summary);
        }

        // Return list of extracted action items for AI agent verification
        // Includes all detected tasks with their descriptions and assignees
        // AI can use this to validate extraction accuracy or trigger follow-up actions
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(actionItems, null, 2),
            },
          ],
        };
      },
    ),
  );
}
