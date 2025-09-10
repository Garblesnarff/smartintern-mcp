import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { slackClient } from '../../slack/client';
import { contextRepository } from '../../db/repository';
import { toolWrapper } from './errors';

/**
 * Registers meeting notes related tools with the MCP server.
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerNoteTools(server: McpServer) {
  server.tool(
    'create_meeting_notes',
    'Create and post meeting notes from a Slack conversation',
    {
      channel_id: z.string().describe('Channel ID'),
      start_ts: z.string().describe('Start timestamp'),
      end_ts: z.string().describe('End timestamp'),
      title: z.string().describe('Meeting title'),
      post_to_channel: z.boolean().optional().describe('Post notes to channel'),
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
        const channelInfo = await slackClient.client.conversations.info({
          channel: channel_id,
        });

        const allMessages = await slackClient.getChannelHistory(channel_id, 1000);

        const meetingMessages = allMessages.filter((msg) => {
          const ts = msg.ts ? parseFloat(msg.ts) : 0;
          return ts >= parseFloat(start_ts) && ts <= parseFloat(end_ts);
        });

        if (meetingMessages.length === 0) {
          throw new Error('No messages found in the specified time range');
        }

        const participantIds = [...new Set(meetingMessages.map((msg) => msg.user))];

        const participants = await Promise.all(
          participantIds.map(async (id) => {
            if (!id) return 'Unknown';
            const user = await slackClient.getUserInfo(id);
            return user?.real_name || user?.name || id;
          }),
        );

        const actionItems: any[] = [];
        const decisions: any[] = [];

        for (const msg of meetingMessages) {
          const text = (msg.text ?? '').toLowerCase();

          if (
            text.includes('action item') ||
            text.includes('todo') ||
            (msg.text ?? '').match(/(?:@\w+|<@[^>]+>).*\b(?:will|should|needs? to|must)\b/i)
          ) {
            actionItems.push({
              description: msg.text ?? '',
              assignee: msg.user,
            });
          }

          if (
            text.includes('decided') ||
            text.includes('decision') ||
            text.includes('conclude') ||
            text.includes('agreement')
          ) {
            decisions.push({
              text: msg.text ?? '',
              user: msg.user,
            });
          }
        }

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

        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: channelInfo.channel?.name || '',
          is_private: channelInfo.channel?.is_private || false,
        });

        const meetingNotes = {
          title,
          summary,
          start_ts,
          end_ts,
          participants,
          action_items: actionItems,
          decisions,
        };

        await contextRepository.storeMeetingNotes(meetingNotes, channelResult.id);

        if (post_to_channel) {
          await slackClient.postMessage(channel_id, `*${title} - Meeting Notes*\n\n${summary}`);
        }

        for (const item of actionItems) {
          await contextRepository.storeActionItem(item, channelResult.id);
        }

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

  server.tool(
    'extract_action_items',
    'Extract action items from a Slack conversation',
    {
      channel_id: z.string().describe('Channel ID'),
      start_ts: z.string().optional().describe('Start timestamp'),
      end_ts: z.string().optional().describe('End timestamp'),
      post_summary: z.boolean().optional().describe('Post summary to channel'),
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
        const channelInfo = await slackClient.client.conversations.info({
          channel: channel_id,
        });

        const allMessages = await slackClient.getChannelHistory(channel_id, 1000);

        const timeframeMessages = allMessages.filter((msg) => {
          const ts = msg.ts ? parseFloat(msg.ts) : 0;
          return ts >= parseFloat(start_ts) && ts <= parseFloat(end_ts);
        });

        if (timeframeMessages.length === 0) {
          throw new Error('No messages found in the specified time range');
        }

        const actionItems: any[] = [];

        for (const msg of timeframeMessages) {
          const text = (msg.text ?? '').toLowerCase();

          if (
            text.includes('action item') ||
            text.includes('todo') ||
            (msg.text ?? '').match(/(?:@\w+|<@[^>]+>).*\b(?:will|should|needs? to|must)\b/i)
          ) {
            const mentionMatch = (msg.text ?? '').match(/<@([A-Z0-9]+)>/);
            const assigneeId = mentionMatch ? mentionMatch[1] : msg.user;

            actionItems.push({
              description: msg.text ?? '',
              assignee: assigneeId,
              message_ts: msg.ts,
            });
          }
        }

        const channelResult = await contextRepository.storeChannel({
          id: channel_id,
          name: channelInfo.channel?.name || '',
          is_private: channelInfo.channel?.is_private || false,
        });

        for (const item of actionItems) {
          await contextRepository.storeActionItem(item, channelResult.id);
        }

        if (post_summary && actionItems.length > 0) {
          const summary =
            `*Action Items Extracted:*\n\n` +
            actionItems
              .map((item) => `• ${item.description}\n   _Assigned to: <@${item.assignee}>_`)
              .join('\n\n');

          await slackClient.postMessage(channel_id, summary);
        }

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
