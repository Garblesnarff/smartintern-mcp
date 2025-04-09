import { WebClient } from '@slack/web-api';
import { config } from '../config';

export class SlackClient {
  client: WebClient;

  constructor() {
    this.client = new WebClient(config.slack.botToken);
  }

  async getChannels() {
    try {
      const result = await this.client.conversations.list({
        exclude_archived: true,
        types: 'public_channel,private_channel'
      });
      return result.channels || [];
    } catch (error) {
      console.error('Error fetching channels:', error);
      throw error;
    }
  }

  async getChannelHistory(channelId: string, limit = 100) {
    try {
      const result = await this.client.conversations.history({
        channel: channelId,
        limit
      });
      return result.messages || [];
    } catch (error) {
      console.error(`Error fetching history for channel ${channelId}:`, error);
      throw error;
    }
  }

  async getThreadReplies(channelId: string, threadTs: string) {
    try {
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs
      });
      return result.messages || [];
    } catch (error) {
      console.error(`Error fetching thread replies for ${channelId}/${threadTs}:`, error);
      throw error;
    }
  }

  async getUserInfo(userId: string) {
    try {
      const result = await this.client.users.info({
        user: userId
      });
      return result.user;
    } catch (error) {
      console.error(`Error fetching user info for ${userId}:`, error);
      throw error;
    }
  }

  async postMessage(channelId: string, text: string, threadTs?: string) {
    try {
      const result = await this.client.chat.postMessage({
        channel: channelId,
        text,
        thread_ts: threadTs
      });
      return result;
    } catch (error) {
      console.error(`Error posting message to ${channelId}:`, error);
      throw error;
    }
  }
}

// Export a singleton instance
export const slackClient = new SlackClient();
