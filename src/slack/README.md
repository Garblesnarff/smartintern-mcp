# Slack Integration Layer

## Overview

The `slack/` directory provides the integration layer between the SmartIntern MCP server and Slack workspaces. It encapsulates Slack API interactions, handles authentication, manages rate limiting, and provides a clean interface for MCP tools to access workspace data and perform operations. The layer uses the official `@slack/web-api` package and follows best practices for bot token authentication and error handling.

**Key Responsibilities:**
- Authentication with Slack bot tokens from environment configuration
- Channel listing and metadata retrieval
- Message history and thread reply fetching
- User profile resolution for participant identification
- Message posting with support for channel and thread replies
- Comprehensive error handling and logging for API failures

## Key Files

- **`client.ts`**: `SlackClient` class wrapping WebClient with common operations and singleton pattern

## Authentication and Setup

### Bot Token Configuration

**Environment Variables** (from `src/config.ts`):
- `SLACK_BOT_TOKEN`: Bot user OAuth token (format: `xoxb-...`)
- `SLACK_SIGNING_SECRET`: Request verification secret for incoming webhooks
- `SLACK_CLIENT_ID`: OAuth app client ID (for user authentication flows)
- `SLACK_CLIENT_SECRET`: OAuth app client secret
- `SLACK_REDIRECT_URI`: OAuth callback URL

**Required Bot Scopes**:
The Slack bot must have the following OAuth scopes for full functionality:
- `channels:read`, `groups:read`, `im:read`, `mpim:read`: Channel access
- `channels:history`, `groups:history`, `im:history`, `mpim:history`: Message history
- `chat:write`: Message posting capabilities
- `users:read`: User profile access for participant resolution
- `reactions:read`, `reactions:write`: Reaction analysis (if implemented)

### Client Initialization

**Singleton Pattern** (`client.ts`):
```typescript
// Exported singleton instance for consistent access
export const slackClient = new SlackClient();

// Internal constructor creates WebClient with bot token
constructor() {
  this.client = new WebClient(config.slack.botToken);
}
```

**Why Singleton?**
- Single authentication context prevents token conflicts
- Centralized rate limiting and retry logic
- Consistent error handling across all tool operations
- Reduces API overhead from multiple client instances

## API Methods

The `SlackClient` class provides high-level methods wrapping common Slack API endpoints:

### Channel Operations

**`getChannels()`** → `conversations.list`
- **Purpose**: Lists all accessible channels (public/private) excluding archived
- **Filters**: `exclude_archived: true`, `types: 'public_channel,private_channel'`
- **Returns**: Array of channel objects `{ id, name, is_private, num_members, ... }`
- **Usage**: Workspace discovery for MCP tools like `list_channels`

**`client.conversations.info(channel)`** (direct WebClient call)
- **Purpose**: Fetches detailed metadata for specific channel
- **Returns**: Complete channel object with topic, purpose, member list, creation date
- **Usage**: Channel context for meeting analysis and action item storage

### Message Operations

**`getChannelHistory(channelId, limit?)`** → `conversations.history`
- **Purpose**: Retrieves recent messages from a channel with pagination support
- **Parameters**: 
  - `channelId`: Target channel ID
  - `limit`: Maximum messages (default: 100, max: 1000 per API call)
- **Returns**: Array of message objects with `ts`, `user`, `text`, `thread_ts`, `attachments`
- **Usage**: Conversation context for `get_channel_history` MCP tool

**`getThreadReplies(channelId, threadTs)`** → `conversations.replies`
- **Purpose**: Fetches complete thread including parent message and all replies
- **Parameters**:
  - `channelId`: Channel containing the thread
  - `threadTs`: Parent message timestamp identifying the thread
- **Returns**: Array of messages in chronological order (parent first, then replies)
- **Usage**: Thread analysis for `get_thread_replies` MCP tool

### User Operations

**`getUserInfo(userId)`** → `users.info`
- **Purpose**: Resolves user ID to human-readable profile information
- **Parameters**: `userId` (e.g., "U1234567890")
- **Returns**: User object with `id`, `name`, `real_name`, `profile` (avatar, title, etc.)
- **Usage**: Participant identification in meeting analysis and action item assignment
- **Fallback**: Returns username or raw ID if profile fetch fails

### Message Posting

**`postMessage(channelId, text, threadTs?)`** → `chat.postMessage`
- **Purpose**: Sends messages to channels or as thread replies
- **Parameters**:
  - `channelId`: Target channel ID
  - `text`: Message content (supports Slack markdown: `*bold*`, `_italic_`, `~strikethrough~`)
  - `threadTs`: Optional thread timestamp for reply context
- **Returns**: API response with `ts` (message timestamp), `channel`, and metadata
- **Usage**: Notifications from MCP tools (`create_follow_up`, meeting summaries, reminders)

## Error Handling

### API Error Management

**Common Error Scenarios**:
- **Authentication Errors**: Invalid/missing bot token (401 Unauthorized)
- **Permission Errors**: Bot lacks required scopes (403 Forbidden)
- **Rate Limiting**: Too many requests (429 Too Many Requests)
- **Not Found**: Channel/user doesn't exist or bot lacks access (404)
- **Validation Errors**: Invalid parameters or malformed requests (400)

**Error Handling Pattern**:
```typescript
async getChannels() {
  try {
    const result = await this.client.conversations.list({ ... });
    return result.channels || [];
  } catch (error) {
    // Log structured error with context
    console.error('Error fetching channels:', error);
    // Re-throw for upstream handling by toolWrapper
    throw error;
  }
}
```

**Retry Logic** (future enhancement):
- Exponential backoff for rate limit errors (429)
- Circuit breaker pattern for repeated authentication failures
- Request queuing for burst traffic scenarios

### Rate Limiting

**Slack API Limits**:
- **Tier 3** (default for most apps): 1 message/second, 50 requests/minute
- **Channel history**: Max 1000 messages per call, pagination via `cursor`
- **User calls**: Limited to prevent abuse (users.info: ~50/minute)

**Client-Side Mitigation**:
- All methods include basic delay between consecutive calls
- Tools using multiple API calls (e.g., participant resolution) use `Promise.all` for parallelization
- Error responses include rate limit information for AI agent awareness

## Integration with MCP Tools

### Data Flow Pattern

**Retrieval Tools** (e.g., `get_channel_history`, `get_thread_replies`):
```
MCP Tool Call → SlackClient.getChannelHistory() → Slack API
                    ↓
            Database Persistence (storeChannel, storeMessage)
                    ↓
            JSON Response → AI Agent
```

**Analysis Tools** (e.g., `create_meeting_notes`, `extract_action_items`):
```
MCP Tool Call → SlackClient.getChannelHistory() → Raw Messages
                    ↓
            Pattern Matching & NLP Heuristics → Extracted Insights
                    ↓
        Database Persistence (storeMeetingNotes, storeActionItem)
                    ↓
            Formatted Summary → SlackClient.postMessage() (optional)
                    ↓
            Structured JSON → AI Agent
```

**Notification Tools** (e.g., `create_follow_up`, `remind_action_items`):
```
MCP Tool Call → Database Query (getActionItems) → Action Item Data
                    ↓
            SlackClient.postMessage() → Formatted Notification
                    ↓
            Confirmation Response → AI Agent
```

### Database Integration Points

**Automatic Persistence**:
- **Channel metadata** stored on first access via `storeChannel()`
- **Messages** persisted with timestamp conversion via `storeMessage()`
- **Meeting notes** stored as structured JSONB via `storeMeetingNotes()`
- **Action items** created with assignee tracking via `storeActionItem()`

**Why Persist Slack Data?**
- **Conversation Context**: Enables cross-tool analysis (e.g., reference previous messages in follow-ups)
- **Historical Analysis**: Track conversation trends and participant engagement
- **Data Backup**: Preserve conversation data beyond Slack retention policies
- **Complex Queries**: Support advanced analytics across time periods and channels

## Usage Examples

### Basic Channel Operations
```typescript
import { slackClient } from './slack/client';
import { contextRepository } from '../db/repository';

// List all channels and store metadata
const channels = await slackClient.getChannels();
for (const channel of channels) {
  await contextRepository.storeChannel(channel);
}

// Get detailed info for specific channel
const channelInfo = await slackClient.client.conversations.info({
  channel: 'C1234567890'
});
```

### Message Retrieval with Persistence
```typescript
// Get recent messages and automatically persist to database
const messages = await slackClient.getChannelHistory('C1234567890', 200);

// Messages are now available in MCP tool responses and database queries
const recentActionItems = await contextRepository.getActionItems();
```

### User Resolution for Meeting Analysis
```typescript
// Resolve participant IDs to display names
const participantIds = ['U123', 'U456', 'U789'];
const participants = await Promise.all(
  participantIds.map(id => slackClient.getUserInfo(id))
);

// Results: [{ real_name: 'John Doe', name: 'john.d' }, ...]
```

### Posting Formatted Notifications
```typescript
// Create action item notification with Slack markdown
const notification = `*Action Item Created:*
Review Q3 financial report
*Assigned to:* <@U1234567890>
*Due:* March 15, 2024`;

await slackClient.postMessage('C1234567890', notification);
```

### Thread Reply Support
```typescript
// Post as reply to existing thread for conversation continuity
const threadTs = '1234567890.123456'; // Parent message timestamp
await slackClient.postMessage('C1234567890', 'Follow-up details...', threadTs);
```

## Error Handling Examples

### API Authentication Error
```typescript
try {
  const channels = await slackClient.getChannels();
} catch (error) {
  if (error.code === 'slack_token_invalid') {
    console.error('Bot token expired or invalid. Check SLACK_BOT_TOKEN environment variable');
  }
  throw error; // Re-throw for toolWrapper handling
}
```

### Rate Limit Handling
```typescript
try {
  const messages = await slackClient.getChannelHistory('C123', 1000);
} catch (error) {
  if (error.code === 'slack_rate_limited') {
    console.error(`Rate limited. Retry after ${error.retry_after} seconds`);
    // Implement exponential backoff
  }
  throw error;
}
```

### Permission Denied
```typescript
try {
  const privateChannelInfo = await slackClient.client.conversations.info({
    channel: 'F1234567890' // Private channel ID
  });
} catch (error) {
  if (error.code === 'channel_not_found') {
    console.error('Bot lacks access to private channel or channel does not exist');
  }
  throw error;
}
```

## Development Guidelines

### Adding New Slack Operations

1. **Extend SlackClient Class**:
```typescript
// Add method to client.ts
async getChannelMembers(channelId: string) {
  try {
    const result = await this.client.conversations.members({ channel: channelId });
    return result.members || [];
  } catch (error) {
    console.error(`Error fetching members for channel ${channelId}:`, error);
    throw error;
  }
}
```

2. **Use in MCP Tools**:
```typescript
server.tool('get_channel_members', 'List members of a Slack channel', {
  channel_id: z.string().describe('Channel ID')
}, toolWrapper('get_channel_members', async ({ channel_id }) => {
  const members = await slackClient.getChannelMembers(channel_id);
  // Resolve member names, persist to database, return JSON
}));
```

### Best Practices

**API Usage**:
- Always use the singleton `slackClient` instance, never create new WebClient instances
- Handle optional fields with nullish coalescing (`??`) or default values
- Include descriptive error messages with context (channel ID, user ID, etc.)
- Respect Slack's pagination limits (max 1000 messages per history call)

**Rate Limiting**:
- Space out API calls when processing multiple channels/users
- Use `Promise.all` for parallel operations but monitor total request volume
- Implement client-side caching for frequently accessed metadata (channel names, user profiles)
- Handle 429 errors with exponential backoff (1s, 2s, 4s delays)

**Data Handling**:
- Convert Slack timestamps (with microseconds) to JavaScript Date objects for storage
- Preserve original Slack message structure in responses for comprehensive analysis
- Sanitize user-generated content before database storage
- Handle missing or malformed data gracefully with fallback values

**Security**:
- Never log sensitive data (bot tokens, user messages with PII)
- Validate all API parameters before making requests
- Use environment variables for all credentials, never hardcode
- Implement request signing verification for incoming webhooks (future enhancement)

## Testing Strategy

### Unit Tests for SlackClient

**Mock External Dependencies**:
```typescript
import { WebClient } from '@slack/web-api';

jest.mock('@slack/web-api', () => {
  return {
    WebClient: jest.fn(() => ({
      conversations: {
        list: jest.fn().mockResolvedValue({ channels: mockChannels }),
        history: jest.fn().mockResolvedValue({ messages: mockMessages }),
        // ... other mocked methods
      },
      users: { info: jest.fn().mockResolvedValue({ user: mockUser }) },
      chat: { postMessage: jest.fn().mockResolvedValue({ ts: '1234567890.123456' }) }
    }))
  };
});
```

**Test Scenarios**:
- Successful API calls with various response formats
- Error conditions (401, 403, 429, 500 status codes)
- Edge cases (empty responses, missing optional fields)
- Rate limiting and retry logic (if implemented)

### Integration Tests

**Real Slack Workspace** (with test bot):
- End-to-end tool execution with actual API calls
- Verify data persistence and response consistency
- Test concurrent operations and race conditions
- Validate error handling with controlled failures

**Mock Server Environment**:
- Test MCP tool calls that trigger Slack operations
- Verify correct error propagation from SlackClient to tool responses
- Ensure database state consistency after successful operations

## Performance Optimization

### Caching Strategy

**Channel Metadata Cache**:
```typescript
// Cache frequently accessed channel names and privacy status
private channelCache = new Map<string, ChannelInfo>();

async getChannelInfo(channelId: string): Promise<ChannelInfo> {
  if (this.channelCache.has(channelId)) {
    return this.channelCache.get(channelId)!;
  }
  
  const info = await this.client.conversations.info({ channel: channelId });
  this.channelCache.set(channelId, info.channel!);
  return info.channel!;
}
```

**User Profile Cache**:
- Cache resolved user names for meeting participant lists
- TTL-based expiration to handle profile changes
- Batch resolution for multiple users in single API call

### Batch Operations

**Parallel User Resolution**:
```typescript
// Resolve multiple users concurrently instead of sequential calls
const userProfiles = await Promise.all(
  uniqueUserIds.map(id => this.getUserInfo(id))
);
```

**Paginated Message Retrieval**:
```typescript
async getAllChannelHistory(channelId: string, maxMessages: number = 5000) {
  let allMessages: any[] = [];
  let cursor: string | undefined;
  
  do {
    const result = await this.client.conversations.history({
      channel: channelId,
      limit: 1000,
      cursor
    });
    
    allMessages = allMessages.concat(result.messages || []);
    cursor = result.response_metadata?.next_cursor;
    
    // Rate limiting delay between paginated calls
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (cursor && allMessages.length < maxMessages);
  
  return allMessages.slice(0, maxMessages);
}
```

## Security Considerations

### Token Management

**Environment Variables Only**:
- Bot token never appears in source code or logs
- Use `.env` files with `.gitignore` exclusion
- Rotate tokens regularly through Slack app management

**Token Scope Minimization**:
- Request only required OAuth scopes for current functionality
- Review and update scopes as new features are added
- Use separate tokens for different environments (dev/staging/prod)

### Data Privacy

**Message Content Handling**:
- Sanitize PII from logs and error messages
- Respect Slack's data retention policies
- Implement data deletion workflows for compliance

**Channel Access Control**:
- Bot only accesses channels it has been invited to
- Private channel data protected by Slack's permission model
- No cross-workspace data access or sharing

### Request Verification (Future)

**Incoming Webhook Security**:
- Verify request signatures using `SLACK_SIGNING_SECRET`
- Implement timestamp validation to prevent replay attacks
- Rate limit incoming requests to prevent abuse

For detailed method documentation and implementation details, see the comprehensive JSDoc comments in `client.ts`.
