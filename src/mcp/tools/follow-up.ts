import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';
import { pool } from '../../db/models';
import { toolWrapper } from './errors';

/**
 * Registers follow-up related tools with the MCP server.
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerFollowUpTools(server: McpServer) {
  server.tool(
    'create_follow_up',
    'Create a follow-up reminder for an action item',
    {
      channel_id: z.string().describe('The ID of the channel to post the follow-up in'),
      description: z.string().describe('Description of the action item'),
      assignee: z.string().optional().describe('User ID of the person assigned'),
      due_date: z.string().optional().describe('Optional due date in ISO format'),
      thread_ts: z.string().optional().describe('Optional thread timestamp'),
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
        const channelInfo = await slackClient.client.conversations.info({
          channel: channel_id,
        });

        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: channelInfo.channel?.name || '',
          is_private: channelInfo.channel?.is_private || false,
        });

        const actionItem = {
          description,
          assignee,
          due_date,
          status: 'open',
        };

        await contextRepository.storeActionItem(actionItem, channelResult.id);

        const assigneeMention = assignee ? `<@${assignee}>` : 'Unassigned';
        const dueInfo = due_date ? `Due: ${due_date}` : 'No due date set';

        const followUpMessage = `*Follow-up Reminder:*
${description}
*Assigned to:* ${assigneeMention}
*Status:* Open
*${dueInfo}*`;

        const result = await slackClient.postMessage(channel_id, followUpMessage, thread_ts);

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

  server.tool(
    'track_follow_up_status',
    'Get or update follow-up status',
    {
      status: z.string().optional().describe('Optional filter for status'),
      action_item_id: z.number().optional().describe('Optional action item ID'),
      new_status: z.string().optional().describe('New status if updating'),
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
        if (action_item_id && new_status) {
          if (!['open', 'completed', 'blocked'].includes(new_status)) {
            throw new Error('Invalid status. Must be one of: open, completed, blocked');
          }

          const client = await pool.connect();
          try {
            await client.query(`UPDATE action_items SET status = $1 WHERE id = $2`, [
              new_status,
              action_item_id,
            ]);

            const result = await client.query(
              `SELECT a.*, c.slack_id as channel_slack_id 
             FROM action_items a
             JOIN channels c ON a.channel_id = c.id
             WHERE a.id = $1`,
              [action_item_id],
            );

            if (result.rows.length === 0) {
              throw new Error(`Action item with ID ${action_item_id} not found`);
            }

            const actionItem = result.rows[0];

            const statusMessage = `*Action Item Status Update:*\n${actionItem.description}\n*Status:* ${new_status}`;

            await slackClient.postMessage(actionItem.channel_slack_id, statusMessage);

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
            client.release();
          }
        } else {
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

  server.tool(
    'remind_action_items',
    'Send reminders for open action items',
    {
      channel_id: z.string().optional().describe('Optional channel ID'),
      days_overdue: z.number().optional().describe('Days overdue filter'),
    },
    toolWrapper(
      'remind_action_items',
      async ({ channel_id, days_overdue = 0 }: { channel_id?: string; days_overdue?: number }) => {
        const client = await pool.connect();
        try {
          let query = `
          SELECT a.*, c.slack_id as channel_slack_id, c.name as channel_name
          FROM action_items a
          JOIN channels c ON a.channel_id = c.id
          WHERE a.status = 'open'
        `;

          const queryParams: any[] = [];
          let paramIndex = 1;

          if (channel_id) {
            query += ` AND c.slack_id = ${paramIndex}`;
            queryParams.push(channel_id);
            paramIndex++;
          }

          if (days_overdue > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days_overdue);

            query += ` AND a.due_date IS NOT NULL AND a.due_date < ${paramIndex}`;
            queryParams.push(cutoffDate);
            paramIndex++;
          }

          const result = await client.query(query, queryParams);
          const actionItems = result.rows;

          const remindersSent = [];

          for (const item of actionItems) {
            const assigneeMention = item.assignee ? `<@${item.assignee}>` : 'Unassigned';
            const dueInfo = item.due_date
              ? `Due date: ${new Date(item.due_date).toLocaleDateString()}`
              : 'No due date set';

            const reminderMessage = `*Action Item Reminder:*
${item.description}
*Assigned to:* ${assigneeMention}
*${dueInfo}*
*Status:* ${item.status}`;

            await slackClient.postMessage(item.channel_slack_id, reminderMessage);

            remindersSent.push({
              id: item.id,
              description: item.description,
              assignee: item.assignee,
              due_date: item.due_date,
              channel: item.channel_name,
            });
          }

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
          client.release();
        }
      },
    ),
  );
}
