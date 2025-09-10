/**
 * FOLLOW-UP TOOLS - Action Item Management and Reminders
 * 
 * This file implements MCP tools for creating, tracking, and reminding about
 * follow-up action items extracted from Slack conversations or meetings.
 * The tools handle action item persistence in the database, Slack notifications,
 * status updates, and automated reminder workflows.
 * 
 * Tool Features:
 * - create_follow_up: Creates new action items with Slack notifications
 * - track_follow_up_status: Retrieves or updates action item status
 * - remind_action_items: Sends reminders for overdue or open action items
 * 
 * Design Decisions:
 * - Dual-mode tools: track_follow_up_status supports both GET and UPDATE operations
 * - Dynamic SQL: Builds queries based on optional parameters for flexibility
 * - Slack formatting: Uses Slack's markdown for rich notifications (@mentions, bold)
 * - Status validation: Enforces valid status values to maintain data integrity
 * - Batch processing: remind_action_items processes multiple items efficiently
 * 
 * Dependencies:
 * - @modelcontextprotocol/sdk/server/mcp.js: MCP server and tool registration
 * - zod: Schema validation for tool inputs
 * - src/slack/client.ts: Slack API for notifications and channel info
 * - src/db/repository.ts: High-level action item operations
 * - src/db/models.ts: Direct database pool for complex queries
 * - ./errors.ts: toolWrapper for consistent error handling
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
import { pool } from '../../db/models';
import { toolWrapper } from './errors';

/**
 * Registers follow-up and action item management tools with the MCP server.
 * 
 * This function registers three tools for action item lifecycle management:
 * 1. create_follow_up: Creates new action items and posts Slack notifications
 * 2. track_follow_up_status: Retrieves action items or updates their status
 * 3. remind_action_items: Sends automated reminders for open/overdue items
 * 
 * Each tool integrates database persistence with Slack notifications and uses
 * Zod schemas for input validation. The tools support the complete action item
 * workflow from creation through completion and follow-up reminders.
 * 
 * @param {McpServer} server - The MCP server instance to register tools with
 * @returns {void}
 * 
 * @example
 * registerFollowUpTools(server);
 * // Registers 'create_follow_up', 'track_follow_up_status', and 'remind_action_items'
 * 
 * // Usage examples:
 * // await mcp.callTool('create_follow_up', { channel_id: 'C123', description: 'Review Q3 report' });
 * // await mcp.callTool('track_follow_up_status', { action_item_id: 1, new_status: 'completed' });
 * // await mcp.callTool('remind_action_items', { days_overdue: 3 });
 */
export function registerFollowUpTools(server: McpServer) {
  // Tool 1: Create new action item with Slack notification
  // This tool handles the initial creation of follow-up tasks from conversations
  server.tool(
    'create_follow_up',
    'Create a follow-up action item and post a formatted reminder message to Slack. The action item is persisted to the database and includes assignee tracking and due dates.',
    {
      channel_id: z.string().describe('The ID of the Slack channel to post the follow-up reminder (e.g., "C1234567890")'),
      description: z.string().describe('Detailed description of the action item or task'),
      assignee: z.string().optional().describe('Slack user ID of the assigned person (e.g., "U1234567890")'),
      due_date: z.string().optional().describe('Optional due date in ISO 8601 format (e.g., "2024-12-31T17:00:00.000Z")'),
      thread_ts: z.string().optional().describe('Optional thread timestamp for reply context (e.g., "1234567890.123456")'),
    },
    toolWrapper(
      'create_follow_up',
      async ({
        channel_id,
        description,
        assignee,
        due_date,
        thread_ts,
      }: {
        channel_id: string;
        description: string;
        assignee?: string;
        due_date?: string;
        thread_ts?: string;
      }) => {
        // Fetch channel information for metadata and database storage
        // This ensures we have the channel name and privacy status
        const channelInfo = await slackClient.client.conversations.info({
          channel: channel_id,
        });

        // Store or update channel in database
        // This maintains consistent channel metadata across the application
        // See: src/db/repository.ts#storeChannel() for implementation
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: channelInfo.channel?.name || '',
          is_private: channelInfo.channel?.is_private || false,
        });

        // Prepare action item data for database storage
        // Default status is 'open' for new items
        const actionItem = {
          description,
          assignee,
          due_date,
          status: 'open' as const,
        };

        // Persist action item to database
        // Returns the database ID for the created item
        // See: src/db/repository.ts#storeActionItem() for storage logic
        await contextRepository.storeActionItem(actionItem, channelResult.id);

        // Format Slack @mention for assignee (or 'Unassigned' if none)
        // Slack user mentions use <@USER_ID> format for notifications
        const assigneeMention = assignee ? `<@${assignee}>` : 'Unassigned';
        
        // Format due date information for the notification
        const dueInfo = due_date ? `Due: ${due_date}` : 'No due date set';

        // Create formatted Slack message using markdown
        // Bold formatting (*text*) and line breaks for readability
        const followUpMessage = `*Follow-up Reminder:*
${description}
*Assigned to:* ${assigneeMention}
*Status:* Open
*${dueInfo}*`;

        // Post the formatted message to Slack (optionally as thread reply)
        // This provides immediate visibility to the team
        // See: src/slack/client.ts#postMessage() for implementation
        const result = await slackClient.postMessage(channel_id, followUpMessage, thread_ts);

        // Return structured response with action item details and message timestamp
        // The message_ts can be used for future thread replies or updates
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  description,
                  assignee,
                  due_date,
                  status: 'open',
                  message_ts: result.ts,
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

  // Tool 2: Dual-purpose tool for retrieving or updating action item status
  // Supports both querying action items (by status) and updating individual items
  server.tool(
    'track_follow_up_status',
    'Retrieve action items by status or update the status of a specific action item. When updating, posts a status update notification to the original channel.',
    {
      status: z.string().optional().describe('Optional status filter for retrieval (e.g., "open", "completed", "blocked")'),
      action_item_id: z.number().optional().describe('Optional action item ID for status update (database ID)'),
      new_status: z.string().optional().describe('New status when updating (must be "open", "completed", or "blocked")'),
    },
    toolWrapper(
      'track_follow_up_status',
      async ({
        status,
        action_item_id,
        new_status,
      }: {
        status?: string;
        action_item_id?: number;
        new_status?: string;
      }) => {
        // Update mode: Both action_item_id and new_status provided
        if (action_item_id && new_status) {
          // Validate status value to maintain data integrity
          // Only allows predefined status values to prevent invalid data
          if (!['open', 'completed', 'blocked'].includes(new_status)) {
            throw new Error('Invalid status. Must be one of: open, completed, blocked');
          }

          // Acquire database connection for the update transaction
          const client = await pool.connect();
          try {
            // Update action item status in database
            // Uses parameterized query to prevent SQL injection
            await client.query(`UPDATE action_items SET status = $1 WHERE id = $2`, [
              new_status,
              action_item_id,
            ]);

            // Retrieve updated action item with channel information
            // JOIN with channels table to get Slack channel ID for notification
            const result = await client.query(
              `SELECT a.*, c.slack_id as channel_slack_id 
             FROM action_items a
             JOIN channels c ON a.channel_id = c.id
             WHERE a.id = $1`,
              [action_item_id],
            );

            // Verify the action item exists after update
            if (result.rows.length === 0) {
              throw new Error(`Action item with ID ${action_item_id} not found`);
            }

            // Get the updated action item details
            const actionItem = result.rows[0];

            // Create formatted status update message for Slack
            // Posted to the original channel for team visibility
            const statusMessage = `*Action Item Status Update:*\n${actionItem.description}\n*Status:* ${new_status}`;

            // Post status update notification to the original channel
            // This keeps the team informed of progress
            await slackClient.postMessage(actionItem.channel_slack_id, statusMessage);

            // Return confirmation with updated details
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      id: actionItem.id,
                      description: actionItem.description,
                      assignee: actionItem.assignee,
                      status: new_status,
                      updated: true,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } finally {
            // Always release database connection back to pool
            client.release();
          }
        } else {
          // Retrieval mode: Get action items by status filter (or all if no filter)
          // Uses high-level repository method for simpler queries
          // See: src/db/repository.ts#getActionItems() for implementation
          const actionItems = await contextRepository.getActionItems(status);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(actionItems, null, 2),
              },
            ],
          };
        }
      },
    ),
  );

  // Tool 3: Automated reminder system for open/overdue action items
  // Scans database for overdue items and sends Slack notifications
  server.tool(
    'remind_action_items',
    'Scan for open action items and send reminder notifications to their respective channels. Can filter by specific channel or days overdue.',
    {
      channel_id: z.string().optional().describe('Optional Slack channel ID to limit reminders to a specific channel'),
      days_overdue: z.number().optional().describe('Optional minimum days overdue to trigger reminders (default: 0 for all open items)'),
    },
    toolWrapper(
      'remind_action_items',
      async ({ channel_id, days_overdue = 0 }: { channel_id?: string; days_overdue?: number }) => {
        // Acquire database connection for the reminder query and processing
        const client = await pool.connect();
        try {
          // Base query: Get all open action items with channel information
          // JOIN with channels for Slack IDs and names needed for notifications
          let query = `
          SELECT a.*, c.slack_id as channel_slack_id, c.name as channel_name
          FROM action_items a
          JOIN channels c ON a.channel_id = c.id
          WHERE a.status = 'open'
        `;

          // Dynamic query parameter array for safe parameterized queries
          const queryParams: any[] = [];
          let paramIndex = 1;

          // Add channel filter if specified
          if (channel_id) {
            // Use parameterized placeholder ($1, $2, etc.) instead of string interpolation
            // This prevents SQL injection attacks
            query += ` AND c.slack_id = $${paramIndex}`;
            queryParams.push(channel_id);
            paramIndex++;
          }

          // Add overdue filter if specified
          if (days_overdue > 0) {
            // Calculate cutoff date: current date minus days_overdue
            // Items with due_date before this cutoff are considered overdue
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days_overdue);

            // Add overdue condition to query
            // Only considers items with due_date set (IS NOT NULL)
            query += ` AND a.due_date IS NOT NULL AND a.due_date < $${paramIndex}`;
            queryParams.push(cutoffDate);
            paramIndex++;
          }

          // Execute the dynamic query with parameters
          // This safely handles all filter combinations
          const result = await client.query(query, queryParams);
          const actionItems = result.rows;

          // Track sent reminders for response summary
          const remindersSent = [];

          // Process each action item and send individual reminders
          for (const item of actionItems) {
            // Format assignee mention for Slack notification
            const assigneeMention = item.assignee ? `<@${item.assignee}>` : 'Unassigned';
            
            // Format due date display (local date string)
            const dueInfo = item.due_date
              ? `Due date: ${new Date(item.due_date).toLocaleDateString()}`
              : 'No due date set';

            // Create formatted reminder message using Slack markdown
            // Includes action description, assignee, due date, and current status
            const reminderMessage = `*Action Item Reminder:*
${item.description}
*Assigned to:* ${assigneeMention}
*${dueInfo}*
*Status:* ${item.status}`;

            // Send individual reminder to the action item's original channel
            // This targets notifications to the relevant team or conversation
            await slackClient.postMessage(item.channel_slack_id, reminderMessage);

            // Track the sent reminder for response summary
            remindersSent.push({
              id: item.id,
              description: item.description,
              assignee: item.assignee,
              due_date: item.due_date,
              channel: item.channel_name,
            });
          }

          // Return summary of reminder operation
          // Includes count of reminders sent and details of processed items
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    reminders_sent: remindersSent.length,
                    action_items: remindersSent,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } finally {
          // Ensure database connection is always released
          client.release();
        }
      },
    ),
  );
}
