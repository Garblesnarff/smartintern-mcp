/**
 * Slack Events API Express server
 * 
 * Receives Slack webhook events, verifies signatures, and stores data in PostgreSQL.
 * 
 * Handles:
 * - URL verification
 * - channel_created
 * - message.channels
 * 
 * Dependencies:
 * - express
 * - crypto
 * - src/config.ts
 * - src/db/repository.ts
 * - src/slack/client.ts
 * 
 * @author Cline
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { contextRepository } from '../db/repository';
import { slackClient } from '../slack/client';

// Express app
const app = express();
const PORT = 3001;

// Middleware: parse JSON
app.use(express.json({ verify: (req: any, res, buf) => { req.rawBody = buf; } }));

// Middleware: verify Slack signature
app.use((req: any, res: Response, next: NextFunction) => {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];

  if (!timestamp || !signature) {
    return res.status(400).send('Missing Slack signature headers');
  }

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 5);
  if (parseInt(timestamp as string) < fiveMinutesAgo) {
    return res.status(400).send('Ignore stale request');
  }

  const sigBasestring = `v0:${timestamp}:${req.rawBody.toString()}`;
  const hmac = crypto.createHmac('sha256', config.slack.signingSecret as string);
  hmac.update(sigBasestring);
  const mySignature = `v0=${hmac.digest('hex')}`;

  if (!crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature as string))) {
    return res.status(401).send('Invalid signature');
  }

  next();
});

// Slack Events endpoint
app.post('/slack/events', async (req: Request, res: Response) => {
  const body = req.body;

  // URL verification challenge
  if (body.type === 'url_verification') {
    return res.send(body.challenge);
  }

  if (body.type === 'event_callback') {
    const event = body.event;

    try {
      if (event.type === 'channel_created') {
        const channel = event.channel;
        await contextRepository.storeChannel({
          id: channel.id,
          name: channel.name,
          is_private: channel.is_private || false
        });
        console.log(`Stored new channel: ${channel.name}`);
      }

      if (event.type === 'message' && event.channel_type === 'channel') {
        const slackChannelId = event.channel;

        // Lookup internal channel ID
        let channelRecord = await contextRepository.getChannelBySlackId(slackChannelId);
        if (!channelRecord) {
          // Fetch channel info from Slack API
          const info = await slackClient.client.conversations.info({ channel: slackChannelId });
          const channelInfo = info.channel as any;
          channelRecord = await contextRepository.storeChannel({
            id: channelInfo.id,
            name: channelInfo.name,
            is_private: channelInfo.is_private
          });
        }

        await contextRepository.storeMessage(event, channelRecord.id);
        console.log(`Stored message in channel ${channelRecord.name}`);
      }
    } catch (error) {
      console.error('Error processing Slack event:', error);
    }
  }

  // Always respond 200 to avoid retries
  res.sendStatus(200);
});

// Start server
export async function startSlackEventsServer() {
  app.listen(PORT, () => {
    console.log(`Slack Events server listening on port ${PORT}`);
  });
}
