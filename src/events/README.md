# Events Directory - Event Handling System

## Overview

The `events/` directory handles event-driven functionality for the SmartIntern MCP server. This includes processing incoming Slack events (messages, reactions, channel updates), internal application events (tool execution, database changes), and outgoing notifications. The event system enables real-time responsiveness, automated workflows, and integration between different components of the application.

**Current Implementation Status**: Initial setup with basic server structure. Event handling capabilities to be expanded based on specific requirements.

**Key Responsibilities:**
- Processing incoming Slack events via webhooks or Event Subscriptions
- Internal event bus for component communication
- Automated responses and workflow triggers
- Event persistence for audit trails and analysis
- Error handling and retry mechanisms for event processing

## Key Files

- **`server.ts`**: Event server setup and basic event handling infrastructure
- **[Future files]**: Specific event handlers for different event types

## Event Types and Architecture

### Slack Events (Incoming)

**Event Subscription Model**:
Slack supports real-time event delivery through Event Subscriptions. The bot receives events via HTTP POST requests to a configured URL.

**Supported Event Types** (planned):
- `message.channels`: New messages in public channels
- `message.im`: Direct messages to the bot
- `message.groups`: Messages in private channels/groups
- `reaction_added`: New message reactions
- `member_joined_channel`: User joins channel (for participant tracking)
- `channel_created`: New channel creation (for metadata updates)
- `user_change`: User profile updates (for participant name resolution)

**Event Processing Flow**:
```
Slack Event → Event Webhook Endpoint → Event Parser → Event Handler
                                           ↓
                                   Database Persistence
                                           ↓
                               MCP Tool Trigger (if applicable)
                                           ↓
                               Response/Notification
```

### Internal Events

**Application Events**:
- `tool_executed`: MCP tool completion with results
- `action_item_created`: New action item from meeting analysis
- `meeting_notes_generated`: Meeting summary completion
- `reminder_triggered`: Scheduled reminder activation
- `conversation_analyzed`: Analysis results available

**Component Communication**:
- Event bus pattern for loose coupling between modules
- Asynchronous processing for non-blocking operations
- Event persistence for audit trails and debugging

## Implementation Details

### Event Server Setup (`server.ts`)

**Purpose**: Initializes the event handling infrastructure and webhook endpoints

**Basic Structure**:
```typescript
// Event server initialization
import express from 'express';
import { Webhook } from '@slack/events-api';

const app = express();
const slackEvents = Webhook({ signingSecret: config.slack.signingSecret });

// Middleware for request verification
app.use('/slack/events', slackEvents.requestListener());

// Event handlers
slackEvents.on('message', handleMessageEvent);
slackEvents.on('reaction_added', handleReactionEvent);
slackEvents.on('error', handleEventError);

// Start event server
app.listen(config.events.port, () => {
  console.log(`Event server running on port ${config.events.port}`);
});
```

**Security Features**:
- Request signature verification using `SLACK_SIGNING_SECRET`
- Timestamp validation to prevent replay attacks
- Rate limiting for incoming webhook requests
- HTTPS enforcement for production deployments

### Event Handler Pattern

**Standard Event Processing**:
```typescript
async function handleMessageEvent(event: any) {
  try {
    // 1. Validate event authenticity and relevance
    if (!isRelevantEvent(event)) return;
    
    // 2. Parse and enrich event data
    const enrichedEvent = await enrichMessageEvent(event);
    
    // 3. Persist event to database for audit trail
    await storeEvent(enrichedEvent);
    
    // 4. Trigger appropriate workflows or MCP tools
    if (shouldTriggerAnalysis(enrichedEvent)) {
      await triggerMeetingAnalysis(enrichedEvent);
    }
    
    // 5. Send acknowledgments or responses if needed
    if (requiresResponse(enrichedEvent)) {
      await sendBotResponse(enrichedEvent);
    }
    
  } catch (error) {
    // 5. Handle errors with retry logic and notifications
    await handleEventProcessingError(event, error);
  }
}
```

## Event Processing Architecture

### Message Event Handling

**Real-time Message Processing**:
```typescript
// Process incoming Slack messages
slackEvents.on('message', async (event) => {
  // Filter out bot's own messages and events
  if (event.bot_id === config.slack.botId) return;
  
  // Basic message classification
  const messageType = classifyMessage(event.text);
  
  switch (messageType) {
    case 'meeting_start':
      await startMeetingTracking(event.channel, event.ts);
      break;
    case 'action_item':
      await extractAndStoreActionItem(event);
      break;
    case 'decision':
      await recordDecision(event);
      break;
    default:
      // Store for conversation context
      await storeMessageForContext(event);
  }
});
```

**Conversation Context Maintenance**:
- All messages persisted to database regardless of type
- Thread tracking for maintaining conversation flow
- Participant identification and engagement tracking
- Automatic categorization for later analysis

### Reaction Event Handling

**Sentiment and Feedback Analysis**:
```typescript
slackEvents.on('reaction_added', async (event) => {
  // Track positive/negative feedback on messages
  const sentiment = analyzeReaction(event.reaction);
  await updateMessageSentiment(event.item.ts, sentiment);
  
  // Trigger workflows based on reactions
  if (event.reaction === 'white_check_mark') {
    await markActionItemComplete(event.item.ts);
  }
  
  // Aggregate reactions for engagement metrics
  await updateReactionStats(event.channel, event.reaction);
});
```

### Channel Event Handling

**Workspace Structure Updates**:
```typescript
slackEvents.on('channel_created', async (event) => {
  // Automatically discover and cache new channels
  await contextRepository.storeChannel({
    id: event.channel.id,
    name: event.channel.name,
    is_private: event.channel.is_private
  });
  
  // Notify MCP tools of workspace changes
  await emitInternalEvent('workspace_updated', { newChannel: event.channel });
});

slackEvents.on('member_joined_channel', async (event) => {
  // Track participant changes for meeting analysis
  await updateChannelMembership(event.channel, event.user, 'joined');
});
```

## Integration with MCP Tools

### Event-Triggered Tool Execution

**Real-time Analysis Triggers**:
```typescript
// Trigger MCP tools based on incoming events
if (isMeetingConclusion(event.text)) {
  // Automatically generate meeting notes
  await executeMcpTool('create_meeting_notes', {
    channel_id: event.channel,
    start_ts: meetingStartTime,
    end_ts: event.ts,
    title: extractMeetingTitle(event),
    post_to_channel: true
  });
}

if (containsActionItem(event.text)) {
  // Extract and create follow-up action
  await executeMcpTool('create_follow_up', {
    channel_id: event.channel,
    description: extractActionDescription(event),
    assignee: extractAssignee(event),
    thread_ts: event.thread_ts
  });
}
```

**Event-to-Tool Mapping**:
- **Message Events** → `get_channel_history`, `create_meeting_notes`, `extract_action_items`
- **Reaction Events** → `track_follow_up_status` (completion marking)
- **Channel Events** → `list_channels`, `get_channel_info` (cache updates)
- **User Events** → Participant resolution in meeting analysis

### Tool Execution Results Handling

**Event Feedback Loop**:
```typescript
// Handle results from triggered MCP tools
mcpTool.on('result', async (toolResult) => {
  switch (toolResult.tool) {
    case 'create_meeting_notes':
      // Post summary to channel and notify participants
      await postMeetingSummary(toolResult.data);
      break;
    case 'extract_action_items':
      // Create notifications for extracted action items
      for (const item of toolResult.data.action_items) {
        await notifyAssignee(item);
      }
      break;
    case 'create_follow_up':
      // Update conversation context with new action item
      await updateThreadContext(toolResult.data.message_ts, 'action_created');
      break;
  }
});
```

## Database Integration

### Event Persistence

**Audit Trail Storage**:
All processed events are persisted for debugging, analysis, and compliance:

```typescript
// Event storage schema (future enhancement)
interface StoredEvent {
  id: number;
  event_type: string;           // 'message', 'reaction_added', 'channel_created'
  slack_event_id: string;       // Unique Slack event identifier
  channel_id: string;           // Slack channel ID
  user_id: string;              // Triggering user ID
  timestamp: Date;              // Event occurrence time
  payload: JSONB;               // Raw event data
  processed: boolean;           // Processing status
  processing_result: JSONB;     // Tool execution results or errors
  created_at: Date;             // Database record timestamp
}
```

**Event Processing States**:
- `received`: Event received and validated
- `processing`: Event being analyzed and tools triggered
- `completed`: All processing finished successfully
- `failed`: Processing failed with error details
- `retry_pending`: Transient failure, will retry later

### Conversation Context Enhancement

**Real-time Context Updates**:
```typescript
// Update conversation context as events are processed
async function updateConversationContext(event: SlackEvent) {
  // Store raw event for complete audit trail
  await storeRawEvent(event);
  
  // Extract meaningful context and update conversation state
  const contextUpdate = extractContextFromEvent(event);
  await updateConversationState(event.channel, contextUpdate);
  
  // Trigger relevant MCP tools based on context changes
  await triggerContextAwareTools(event.channel, contextUpdate);
}
```

## Error Handling and Reliability

### Event Processing Guarantees

**At-Least-Once Delivery**:
- Slack events may be delivered multiple times (idempotent processing required)
- Database operations use UPSERT patterns to handle duplicates
- Event IDs tracked to prevent duplicate processing
- Retry mechanisms for failed processing attempts

**Dead Letter Queue** (planned):
- Events that fail after maximum retry attempts
- Manual intervention interface for failed events
- Automatic alerting for processing failures
- Data recovery workflows for critical events

### Error Classification

**Event-Level Errors**:
- **Authentication**: Invalid signing secret or bot token
- **Validation**: Malformed event data or missing required fields
- **Duplicate**: Event already processed (idempotent handling)
- **Rate Limit**: Slack webhook rate limiting exceeded

**Processing Errors**:
- **Tool Execution**: MCP tool failures during event processing
- **Database**: Persistence failures or constraint violations
- **External API**: Slack API or third-party service failures
- **Internal**: Application bugs or unexpected conditions

### Retry Strategy

**Exponential Backoff**:
```typescript
async function processEventWithRetry(event: SlackEvent, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await processEvent(event);
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      
      // Wait before retry (1s, 2s, 4s, etc.)
      const delay = Math.pow(2, attempt) * 1000;
      await sleep(delay);
      
      // Mark event as retry_pending in database
      await markEventForRetry(event.id, attempt);
    }
  }
}
```

## Development Guidelines

### Implementing Event Handlers

**Standard Handler Pattern**:
```typescript
async function handleMessageEvent(event: MessageEvent) {
  // 1. Validate event authenticity and relevance
  const isValidEvent = await validateSlackEvent(event);
  if (!isValidEvent) {
    console.log('Ignoring invalid or irrelevant event:', event.event_id);
    return;
  }
  
  // 2. Parse and enrich event data
  const enrichedEvent = await enrichEventData(event);
  
  // 3. Persist raw event for audit trail
  await storeRawEvent(enrichedEvent);
  
  // 4. Classify event and route to appropriate processors
  const eventType = classifyEvent(enrichedEvent);
  await routeEventToProcessor(eventType, enrichedEvent);
  
  // 5. Update processing status
  await markEventAsProcessed(enrichedEvent.id);
  
  console.log(`Successfully processed message event: ${enrichedEvent.event_id}`);
}
```

**Event Enrichment**:
- Resolve user display names from user IDs
- Fetch channel metadata for context
- Extract relevant timestamps and relationships
- Add internal metadata (processing time, tool triggers)

### Testing Event Handlers

**Unit Tests**:
```typescript
describe('Message Event Handler', () => {
  it('should process valid meeting start message', async () => {
    const mockEvent = createMockMessageEvent('meeting_start');
    const result = await handleMessageEvent(mockEvent);
    
    expect(result).toBeDefined();
    expect(databaseStoreEvent).toHaveBeenCalled();
    expect(triggerMeetingTracking).toHaveBeenCalled();
  });
  
  it('should ignore bot messages', async () => {
    const mockEvent = createMockMessageEvent('bot_message');
    const result = await handleMessageEvent(mockEvent);
    
    expect(result).toBeUndefined();
    expect(databaseStoreEvent).not.toHaveBeenCalled();
  });
});
```

**Integration Tests**:
- End-to-end event processing with real database
- Mock Slack API responses for event verification
- Test concurrent event processing scenarios
- Verify event persistence and tool triggering

### Event Schema Validation

**Incoming Event Validation**:
```typescript
import { z } from 'zod';

const MessageEventSchema = z.object({
  type: z.literal('message'),
  channel: z.string(),
  user: z.string(),
  text: z.string().optional(),
  ts: z.string(),
  thread_ts: z.string().optional(),
  // ... additional Slack event fields
});

function validateSlackEvent(event: any): event is ValidSlackEvent {
  try {
    MessageEventSchema.parse(event);
    return true;
  } catch (validationError) {
    console.error('Invalid Slack event format:', validationError);
    return false;
  }
}
```

## Performance Considerations

### Event Processing Throughput

**Horizontal Scaling**:
- Multiple event server instances for high-volume workspaces
- Load balancing across event processing nodes
- Shared database with connection pooling
- Redis for event queue and caching

**Batching and Queuing**:
- Batch similar events for bulk processing
- Message queue (RabbitMQ, SQS) for decoupling
- Priority queuing for critical events (action items, decisions)
- Dead letter queues for failed processing

### Memory Management

**Event Streaming**:
- Process large event volumes without loading everything into memory
- Use streaming parsers for webhook payloads
- Implement backpressure handling for high-throughput scenarios
- Graceful degradation during peak loads

### Database Optimization

**Event Table Indexing**:
```sql
-- Index frequently queried event fields
CREATE INDEX idx_events_channel_timestamp ON events(channel_id, timestamp DESC);
CREATE INDEX idx_events_type_status ON events(event_type, processed);
CREATE INDEX idx_events_correlation_id ON events(correlation_id);

-- Partial indexes for common queries
CREATE INDEX idx_unprocessed_events ON events(event_type) 
WHERE processed = false AND retry_count < 3;
```

**Partitioning Strategy**:
- Partition events table by date for large volumes
- Archive old events to separate analytical database
- Implement event retention policies based on compliance requirements

## Security Considerations

### Webhook Security

**Request Verification**:
- Verify all incoming webhooks using Slack's signing secret
- Implement timestamp validation (within 5 minutes of current time)
- Reject requests with invalid signatures or timestamps
- Log verification failures for security monitoring

**Rate Limiting**:
- Limit webhook requests per IP/workspace to prevent abuse
- Implement exponential backoff for rate-limited senders
- Monitor for unusual request patterns (DDoS detection)
- Graceful degradation during attack scenarios

### Event Data Sanitization

**PII Protection**:
- Sanitize personally identifiable information from logs
- Hash sensitive data before storage (if required by compliance)
- Implement data masking for debugging and monitoring
- Regular security audits of event processing pipelines

### Access Control

**Event Access Permissions**:
- Restrict event processing to authorized bot tokens
- Validate event source before processing
- Implement role-based access for different event types
- Audit trail of all event processing activities

## Future Enhancements

### Advanced Event Processing

**Machine Learning Integration**:
- Real-time sentiment analysis of incoming messages
- Automatic topic classification for conversation routing
- Predictive action item generation based on conversation patterns
- Anomaly detection for unusual conversation patterns

**Workflow Automation**:
- Event-driven workflow orchestration
- Integration with external task management systems
- Automated escalation for overdue action items
- Cross-workspace event correlation and analysis

### Event Analytics

**Real-time Dashboards**:
- Conversation volume and engagement metrics
- Action item completion rates and bottlenecks
- Meeting effectiveness analysis based on outcomes
- Bot interaction patterns and usage analytics

**Historical Analysis**:
- Conversation trend analysis over time
- Participant engagement and contribution patterns
- Action item success rates by team and project
- Event processing performance monitoring

For detailed implementation of the current event server and planned enhancements, see the code documentation in `server.ts` and related configuration files.
