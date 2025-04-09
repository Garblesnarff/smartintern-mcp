import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';

export function registerNoteTools(server: McpServer) {
  server.tool({
    name: 'create_meeting_notes',
    description: 'Create and post meeting notes from a Slack conversation',
    parameters: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'The ID of the channel where the meeting occurred'
        },
        start_ts: {
          type: 'string',
          description: 'The timestamp of the first message of the meeting'
        },
        end_ts: {
          type: 'string',
          description: 'The timestamp of the last message of the meeting'
        },
        title: {
          type: 'string',
          description: 'Title for the meeting notes'
        },
        post_to_channel: {
          type: 'boolean',
          description: 'Whether to post the meeting notes to the channel',
          default: true
        }
      },
      required: ['channel_id', 'start_ts', 'end_ts', 'title']
    },
    handler: async ({ channel_id, start_ts, end_ts, title, post_to_channel = true }) => {
      try {
        // Get channel info
        const channelInfo = await slackClient.client.conversations.info({
          channel: channel_id
        });
        
        // Get messages from the meeting timeframe
        const allMessages = await slackClient.getChannelHistory(channel_id, 1000);
        const meetingMessages = allMessages.filter(msg => {
          const ts = parseFloat(msg.ts);
          return ts >= parseFloat(start_ts) && ts <= parseFloat(end_ts);
        });
        
        if (meetingMessages.length === 0) {
          throw new Error('No messages found in the specified time range');
        }
        
        // Get unique participants
        const participantIds = [...new Set(meetingMessages.map(msg => msg.user))];
        const participants = await Promise.all(
          participantIds.map(async id => {
            const user = await slackClient.getUserInfo(id);
            return user?.real_name || user?.name || id;
          })
        );
        
        // Extract action items and decisions (simple heuristics for now)
        const actionItems = [];
        const decisions = [];
        
        for (const msg of meetingMessages) {
          // Simple action item detection
          if (msg.text.toLowerCase().includes('action item') || 
              msg.text.toLowerCase().includes('todo') ||
              msg.text.match(/(?:@\\w+|<@[^>]+>).*\\b(?:will|should|needs? to|must)\\b/i)) {
            
            const actionItem = {
              description: msg.text,
              assignee: msg.user
            };
            actionItems.push(actionItem);
          }
          
          // Simple decision detection
          if (msg.text.toLowerCase().includes('decided') || 
              msg.text.toLowerCase().includes('decision') ||
              msg.text.toLowerCase().includes('conclude') ||
              msg.text.toLowerCase().includes('agreement')) {
            
            decisions.push({
              text: msg.text,
              user: msg.user
            });
          }
        }
        
        // Generate summary
        const summary = `Meeting in #${channelInfo.channel?.name || channel_id}\n\n` +
          `**Participants:** ${participants.join(', ')}\n\n` +
          `**Discussion Summary:**\n` +
          `Meeting started at ${new Date(parseFloat(start_ts) * 1000).toLocaleString()}\n` +
          `${meetingMessages.length} messages exchanged\n\n` +
          `**Action Items:**\n` +
          (actionItems.length > 0 
            ? actionItems.map(item => `- ${item.description}`).join('\n') 
            : '- None identified') +
          `\n\n**Decisions:**\n` +
          (decisions.length > 0 
            ? decisions.map(decision => `- ${decision.text}`).join('\n') 
            : '- None identified');
        
        // Store the notes in the database
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: channelInfo.channel?.name || '',
          is_private: channelInfo.channel?.is_private || false
        });
        
        const meetingNotes = {
          title,
          summary,
          start_ts,
          end_ts,
          participants,
          action_items: actionItems,
          decisions: decisions
        };
        
        await contextRepository.storeMeetingNotes(meetingNotes, channelResult.id);
        
        // Post to channel if requested
        if (post_to_channel) {
          await slackClient.postMessage(channel_id, 
            `*${title} - Meeting Notes*\n\n${summary}`);
        }
        
        // Store action items in database
        for (const item of actionItems) {
          await contextRepository.storeActionItem(item, channelResult.id);
        }
        
        return {
          title,
          summary,
          participants,
          action_items: actionItems,
          decisions: decisions,
          posted: post_to_channel
        };
      } catch (error) {
        console.error(`Error in create_meeting_notes tool for ${channel_id}:`, error);
        throw new Error('Failed to create meeting notes: ' + error.message);
      }
    }
  });

  server.tool({
    name: 'extract_action_items',
    description: 'Extract action items from a Slack conversation',
    parameters: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'The ID of the channel to extract action items from'
        },
        start_ts: {
          type: 'string',
          description: 'Optional timestamp to start extraction from',
          default: '0'
        },
        end_ts: {
          type: 'string',
          description: 'Optional timestamp to end extraction at',
          default: String(Date.now() / 1000)
        },
        post_summary: {
          type: 'boolean',
          description: 'Whether to post a summary of action items to the channel',
          default: false
        }
      },
      required: ['channel_id']
    },
    handler: async ({ channel_id, start_ts = '0', end_ts = String(Date.now() / 1000), post_summary = false }) => {
      try {
        // Get channel info
        const channelInfo = await slackClient.client.conversations.info({
          channel: channel_id
        });
        
        // Get messages from the timeframe
        const allMessages = await slackClient.getChannelHistory(channel_id, 1000);
        const timeframeMessages = allMessages.filter(msg => {
          const ts = parseFloat(msg.ts);
          return ts >= parseFloat(start_ts) && ts <= parseFloat(end_ts);
        });
        
        if (timeframeMessages.length === 0) {
          throw new Error('No messages found in the specified time range');
        }
        
        // Extract action items (simple heuristics for now)
        const actionItems = [];
        
        for (const msg of timeframeMessages) {
          // Simple action item detection
          if (msg.text.toLowerCase().includes('action item') || 
              msg.text.toLowerCase().includes('todo') ||
              msg.text.match(/(?:@\\w+|<@[^>]+>).*\\b(?:will|should|needs? to|must)\\b/i)) {
            
            // Try to extract assignee from @mentions
            const mentionMatch = msg.text.match(/<@([A-Z0-9]+)>/);
            const assigneeId = mentionMatch ? mentionMatch[1] : msg.user;
            
            const actionItem = {
              description: msg.text,
              assignee: assigneeId,
              message_ts: msg.ts
            };
            actionItems.push(actionItem);
          }
        }
        
        // Store action items in database
        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: channelInfo.channel?.name || '',
          is_private: channelInfo.channel?.is_private || false
        });
        
        for (const item of actionItems) {
          await contextRepository.storeActionItem(item, channelResult.id);
        }
        
        // Post summary if requested
        if (post_summary && actionItems.length > 0) {
          const summary = `*Action Items Extracted:*\n\n` +
            actionItems.map(item => {
              return `• ${item.description}\n   _Assigned to: <@${item.assignee}>_`;
            }).join('\n\n');
          
          await slackClient.postMessage(channel_id, summary);
        }
        
        return actionItems;
      } catch (error) {
        console.error(`Error in extract_action_items tool for ${channel_id}:`, error);
        throw new Error('Failed to extract action items: ' + error.message);
      }
    }
  });
}
