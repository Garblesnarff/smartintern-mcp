import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';
import { pool } from '../../db/models';

export function registerFollowUpTools(server: McpServer) {
  server.tool({
    name: 'create_follow_up',
    description: 'Create a follow-up reminder for an action item',
    parameters: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'The ID of the channel to post the follow-up in'
        },
        description: {
          type: 'string',
          description: 'Description of the action item'
        },
        assignee: {
          type: 'string',
          description: 'User ID of the person assigned to this action item'
        },
        due_date: {
          type: 'string',
          description: 'Optional due date in ISO format (YYYY-MM-DD)',
          default: undefined
        },
        thread_ts: {
          type: 'string',
          description: 'Optional thread timestamp to attach the follow-up to',
          default: undefined
        }
      },
      required: ['channel_id', 'description']
    },
    handler: async ({ channel_id, description, assignee, due_date, thread_ts }) => {
      try {
        // Get channel info
        const channelInfo = await slackClient.client.conversations.info({
          channel: channel_id
        });
        
        // Store action item in database
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: channelInfo.channel?.name || '',
          is_private: channelInfo.channel?.is_private || false
        });
        
        const actionItem = {
          description,
          assignee,
          due_date,
          status: 'open'
        };
        
        await contextRepository.storeActionItem(actionItem, channelResult.id);
        
        // Format assignee mention if provided
        const assigneeMention = assignee ? `<@${assignee}>` : 'Unassigned';
        
        // Format due date if provided
        const dueInfo = due_date ? `Due: ${due_date}` : 'No due date set';
        
        // Post follow-up to Slack
        const followUpMessage = `*Follow-up Reminder:*\n${description}\n*Assigned to:* ${assigneeMention}\n*Status:* Open\n*${dueInfo}*`;
        
        const result = await slackClient.postMessage(channel_id, followUpMessage, thread_ts);
        
        return {
          description,
          assignee,
          due_date,
          status: 'open',
          message_ts: result.ts
        };
      } catch (error) {
        console.error(`Error in create_follow_up tool for ${channel_id}:`, error);
        throw new Error('Failed to create follow-up: ' + error.message);
      }
    }
  });

  server.tool({
    name: 'track_follow_up_status',
    description: 'Get the status of all follow-ups or update a specific follow-up',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Optional filter for status (open, completed, blocked)',
          default: undefined
        },
        action_item_id: {
          type: 'number',
          description: 'Optional ID of a specific action item to update',
          default: undefined
        },
        new_status: {
          type: 'string',
          description: 'New status if updating a specific action item (open, completed, blocked)',
          default: undefined
        }
      }
    },
    handler: async ({ status, action_item_id, new_status }) => {
      try {
        // If updating a specific action item
        if (action_item_id && new_status) {
          // Simple validation
          if (!['open', 'completed', 'blocked'].includes(new_status)) {
            throw new Error('Invalid status. Must be one of: open, completed, blocked');
          }
          
          const client = await pool.connect();
          try {
            // Update the action item
            await client.query(
              `UPDATE action_items SET status = $1 WHERE id = $2`,
              [new_status, action_item_id]
            );
            
            // Get the updated item
            const result = await client.query(
              `SELECT a.*, c.slack_id as channel_slack_id 
               FROM action_items a
               JOIN channels c ON a.channel_id = c.id
               WHERE a.id = $1`,
              [action_item_id]
            );
            
            if (result.rows.length === 0) {
              throw new Error(`Action item with ID ${action_item_id} not found`);
            }
            
            const actionItem = result.rows[0];
            
            // Post update to Slack
            const statusMessage = `*Action Item Status Update:*\n${actionItem.description}\n*Status:* ${new_status}`;
            
            await slackClient.postMessage(actionItem.channel_slack_id, statusMessage);
            
            return {
              id: actionItem.id,
              description: actionItem.description,
              assignee: actionItem.assignee,
              status: new_status,
              updated: true
            };
          } finally {
            client.release();
          }
        } else {
          // Get all action items, optionally filtered by status
          const actionItems = await contextRepository.getActionItems(status);
          return actionItems;
        }
      } catch (error) {
        console.error(`Error in track_follow_up_status tool:`, error);
        throw new Error('Failed to track follow-up status: ' + error.message);
      }
    }
  });

  server.tool({
    name: 'remind_action_items',
    description: 'Send reminders for open action items',
    parameters: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Optional channel ID to limit reminders to a specific channel',
          default: undefined
        },
        days_overdue: {
          type: 'number',
          description: 'Optional number of days overdue to filter by',
          default: 0
        }
      }
    },
    handler: async ({ channel_id, days_overdue = 0 }) => {
      try {
        const client = await pool.connect();
        try {
          // Build query based on parameters
          let query = `
            SELECT a.*, c.slack_id as channel_slack_id, c.name as channel_name
            FROM action_items a
            JOIN channels c ON a.channel_id = c.id
            WHERE a.status = 'open'
          `;
          
          const queryParams = [];
          let paramIndex = 1;
          
          if (channel_id) {
            query += ` AND c.slack_id = $${paramIndex}`;
            queryParams.push(channel_id);
            paramIndex++;
          }
          
          if (days_overdue > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days_overdue);
            
            query += ` AND a.due_date IS NOT NULL AND a.due_date < $${paramIndex}`;
            queryParams.push(cutoffDate);
            paramIndex++;
          }
          
          const result = await client.query(query, queryParams);
          const actionItems = result.rows;
          
          // Send reminders for each action item
          const remindersSent = [];
          
          for (const item of actionItems) {
            const assigneeMention = item.assignee ? `<@${item.assignee}>` : 'Unassigned';
            const dueInfo = item.due_date 
              ? `Due date: ${new Date(item.due_date).toLocaleDateString()}`
              : 'No due date set';
            
            const reminderMessage = `*Action Item Reminder:*\n${item.description}\n*Assigned to:* ${assigneeMention}\n*${dueInfo}*\n*Status:* ${item.status}`;
            
            await slackClient.postMessage(item.channel_slack_id, reminderMessage);
            
            remindersSent.push({
              id: item.id,
              description: item.description,
              assignee: item.assignee,
              due_date: item.due_date,
              channel: item.channel_name
            });
          }
          
          return {
            reminders_sent: remindersSent.length,
            action_items: remindersSent
          };
        } finally {
          client.release();
        }
      } catch (error) {
        console.error(`Error in remind_action_items tool:`, error);
        throw new Error('Failed to remind action items: ' + error.message);
      }
    }
  });
}
