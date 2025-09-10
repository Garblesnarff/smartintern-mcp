# MCP Tools - Slack Integration Toolset

## Overview

The `tools/` directory contains the complete implementation of MCP (Model Context Protocol) tools that power the SmartIntern server's Slack integration capabilities. Each tool provides specific functionality for AI agents to interact with Slack workspaces, analyze conversations, extract actionable insights, and manage follow-up tasks. The tools follow a consistent implementation pattern with Zod input validation, error handling via `toolWrapper`, and integration with the Slack API and database layers.

**Tool Categories**: 12+ specialized tools organized into functional groups for Slack operations, productivity features, content analysis, and workspace management.

**Key Features**:
- Input validation using Zod schemas with descriptive parameter documentation
- Standardized error handling and logging through `toolWrapper`
- Automatic data persistence to PostgreSQL for conversation context
- JSON-formatted responses optimized for AI agent consumption
- Integration with Slack API, database repository, and external services

## Directory Structure

```
tools/
├── index.ts                   # Central registry orchestrating all tool registration
├── channel.ts                 # Channel discovery and metadata tools
├── message.ts                 # Message retrieval, threading, and posting tools
├── notes.ts                   # Meeting analysis and action item extraction tools
├── follow-up.ts               # Action item creation, tracking, and reminder tools
├── file.ts                    # File operations and attachment handling
├── enhancement.ts             # Message enhancement and content analysis
├── search.ts                  # Workspace content search and filtering
├── reaction.ts                # Message reaction analysis and sentiment tracking
├── reminders.ts               # Scheduled reminder and notification management
├── workspace.ts               # Workspace configuration and management tools
├── bookmarks.ts               # Important content bookmarking and organization
├── canvases.ts                # Slack Canvas integration for structured content
├── errors.ts                  # toolWrapper for standardized error handling
├── __tests__/                 # Unit tests for individual tool implementations
└── __mocks__/                 # Mock implementations for testing
```

## Tool Implementation Pattern

### Registration Functions

Each tool file exports a registration function that adds one or more tools to the MCP server:

```typescript
/**
 * Registers Slack channel-related tools with the MCP server.
 * @param server - The MCP server instance to register tools with
 */
export function registerChannelTools(server: McpServer) {
  // Tool definitions using server.tool()
}
```

**Registration Flow** (`tools/index.ts`):
1. Import all registration functions from individual tool modules
2. Call each registration function in logical order (core → productivity → analysis → workspace)
3. All tools become available via MCP protocol for AI agent execution

### Tool Definition Structure

Every tool follows this standardized pattern:

```typescript
server.tool(
  'tool_name',                              // Unique identifier (kebab-case)
  'Comprehensive tool description...',      // Human-readable description for AI agents
  {                                         // Input schema with Zod validation
    channel_id: z.string().describe('The Slack channel ID (e.g., "C1234567890")'),
    limit: z.number().optional().describe('Maximum number of messages (default: 100)'),
    // ... additional parameters with validation and descriptions
  },
  toolWrapper(                              // Error handling wrapper
    'tool_name',                            // Tool identifier for logging
    async (params: ValidatedParams) => {     // Async implementation with validated input
      try {
        // 1. Input processing and validation
        // 2. External API calls (SlackClient, repository)
        // 3. Data persistence to database
        // 4. Response formatting as MCP content
        
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(processedData, null, 2),  // Structured JSON response
            },
          ],
        };
      } catch (error) {
        // Errors automatically handled by toolWrapper
        throw error;
      }
    }
  )
);
```

### Common Dependencies

**Zod Validation** (`zod` package):
- Type-safe input validation with descriptive error messages
- `.describe()` method provides parameter documentation for AI agents
- Optional parameters with sensible defaults
- Complex object validation for structured inputs

**toolWrapper** (`./errors.ts`):
- Standardized error handling across all tools
- Structured logging with tool name, parameters, and error context
- Error classification (validation, API, database, internal)
- Graceful degradation with meaningful fallback responses
- Automatic retry logic for transient failures

**Slack Integration** (`../../slack/client`):
- Singleton `slackClient` instance for all API operations
- High-level methods wrapping common Slack endpoints
- Rate limiting and error handling built into client methods
- Consistent response formats across different API calls

**Database Repository** (`../../db/repository`):
- `contextRepository` singleton for all data operations
- Automatic persistence of retrieved Slack data (channels, messages)
- Structured storage of extracted insights (action items, meeting notes)
- CRUD operations with foreign key relationship management

## Tool Categories and Functionality

### Core Slack Tools

**Channel Operations** (`channel.ts`):
- **`list_channels`**: Lists all accessible channels with basic metadata (id, name, privacy, member count)
- **`get_channel_info`**: Fetches detailed channel metadata including topic, purpose, member list, creation date

**Message Operations** (`message.ts`):
- **`get_channel_history`**: Retrieves recent messages from channel with configurable limit (up to 1000)
- **`get_thread_replies`**: Fetches complete message thread including parent and all replies
- **`send_message`**: Posts messages to channels or as thread replies with Slack markdown support

**File Operations** (`file.ts`):
- File upload and download capabilities
- Attachment analysis and metadata extraction
- Integration with message attachment handling

### Productivity Tools

**Meeting Analysis** (`notes.ts`):
- **`create_meeting_notes`**: AI-assisted meeting summary generation from conversation timeframe
  - Participant identification and name resolution
  - Automatic action item and decision extraction using pattern matching
  - Formatted summary generation with optional channel posting
- **`extract_action_items`**: Focused action item extraction with assignee detection from @mentions

**Action Item Management** (`follow-up.ts`):
- **`create_follow_up`**: Creates trackable action items with Slack notifications and assignee @mentions
- **`track_follow_up_status`**: Dual-purpose tool for retrieving action items or updating status (open/closed/blocked)
- **`remind_action_items`**: Automated reminder system for overdue or open action items with channel filtering

**Reminders** (`reminders.ts`):
- Scheduled notification management
- Recurring task reminders
- Integration with action item due dates

### Analysis Tools

**Content Enhancement** (`enhancement.ts`):
- Message summarization and key point extraction
- Conversation sentiment analysis
- Important content highlighting and tagging

**Search and Discovery** (`search.ts`):
- Workspace-wide content search across channels and messages
- Advanced filtering by date range, participants, keywords
- Semantic search capabilities for conversation context

**Reaction Analysis** (`reaction.ts`):
- Message reaction sentiment analysis (👍 positive, 👎 negative, ❓ questions)
- Emoji-based feedback aggregation
- Reaction trend analysis for engagement metrics

### Workspace Tools

**Workspace Management** (`workspace.ts`):
- Workspace configuration and settings management
- Bot permission and scope management
- Integration settings for different Slack apps

**Bookmarks** (`bookmarks.ts`):
- Important message and channel bookmarking
- Personal and team bookmark organization
- Quick access to frequently referenced content

**Canvas Integration** (`canvases.ts`):
- Slack Canvas document creation and management
- Structured content generation from meeting notes
- Integration with action item tracking for project documentation

## Common Implementation Patterns

### Data Persistence Workflow

**Automatic Caching Strategy**:
All retrieval tools automatically persist data to maintain conversation context:

```typescript
// Pattern used in all message retrieval tools
async function retrieveAndStoreMessages(channelId: string) {
  // 1. Fetch from Slack API
  const messages = await slackClient.getChannelHistory(channelId, limit);
  
  // 2. Ensure channel metadata exists
  const channelResult = await contextRepository.storeChannel({
    id: channelId,
    name: '', // Could fetch real name
    is_private: false
  });
  
  // 3. Persist all messages for context
  for (const message of messages) {
    await contextRepository.storeMessage(message, channelResult.id);
  }
  
  return messages; // Return for tool response
}
```

**Why Persist Everything?**
- **Cross-Tool Context**: Later tools can reference previous conversation data
- **Historical Analysis**: Track conversation evolution and participant engagement
- **Data Backup**: Preserve content beyond Slack's retention policies
- **Complex Queries**: Enable analytics across multiple tools and time periods

### Error Handling with toolWrapper

**Standardized Error Flow**:
```typescript
// All tools use this wrapper pattern
toolWrapper('get_channel_history', async ({ channel_id, limit = 100 }) => {
  try {
    // Tool implementation
    const messages = await slackClient.getChannelHistory(channel_id, limit);
    
    // Auto-persist to database
    await storeMessagesWithChannel(channel_id, messages);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }]
    };
  } catch (error) {
    // toolWrapper handles:
    // - Structured logging with tool name and parameters
    // - Error classification (API, validation, database)
    // - Standardized error response format
    // - Retry logic for transient failures
    throw error; // Re-throw for wrapper processing
  }
});
```

### Response Formatting Standards

**MCP Content Structure**:
All tools return responses in the standardized MCP format:

```typescript
{
  content: [
    {
      type: 'text' as const,                    // Content type
      text: JSON.stringify(data, null, 2)       // Pretty-printed JSON for AI parsing
    }
  ]
}
```

**Data Structure Guidelines**:
- **Raw Slack Objects**: Return complete Slack API responses for comprehensive analysis
- **Simplified Views**: Create reduced representations for lists and summaries
- **Metadata Inclusion**: Always include timestamps, IDs, and context references
- **Consistent Naming**: Use camelCase for JavaScript objects, snake_case for database fields

## Testing Structure

### Unit Tests (`__tests__/`)

**Individual Tool Tests**:
```typescript
// __tests__/channel.test.ts
describe('Channel Tools', () => {
  describe('list_channels', () => {
    it('should return accessible channels with metadata', async () => {
      // Mock SlackClient.getChannels()
      // Mock contextRepository.storeChannel()
      // Verify tool response format and database persistence
    });
    
    it('should handle API errors gracefully', async () => {
      // Mock Slack API failure
      // Verify error response structure
      // Verify no database corruption
    });
  });
});
```

**Common Test Utilities**:
- Mock implementations in `__mocks__/` for SlackClient and repository
- Test data fixtures for various Slack API response formats
- Validation test helpers for Zod schema verification
- Response format validation utilities

### Integration Tests

**End-to-End Tool Execution**:
- Real database interactions with test data
- Mock external APIs (Slack, MCP protocol)
- Verify complete workflow from tool call to response
- Test concurrent tool execution scenarios

**Data Consistency Tests**:
- Verify foreign key relationships maintained correctly
- Test transaction rollback on partial failures
- Validate JSONB data structure integrity
- Ensure conversation context preserved across multiple tool calls

## Development Guidelines

### Creating New Tools

**Step 1: Define Tool Specification**
```typescript
// Plan tool functionality, parameters, and expected outputs
// Consider integration points (Slack API, database, external services)
// Define success and error scenarios
```

**Step 2: Implement Registration Function**
```typescript
// tools/new-feature.ts
export function registerNewFeatureTools(server: McpServer) {
  server.tool(
    'new_feature_tool',
    'Description of what this tool does...',
    {
      // Zod schema with .describe() documentation
      required_param: z.string().describe('Required parameter description'),
      optional_param: z.number().optional().describe('Optional parameter with default behavior')
    },
    toolWrapper('new_feature_tool', async (params) => {
      // Implementation following established patterns
      // Input processing, external calls, data persistence, response formatting
    })
  );
}
```

**Step 3: Register Globally**
```typescript
// tools/index.ts
import { registerNewFeatureTools } from './new-feature';

// Add to appropriate category in registerAllTools()
registerNewFeatureTools(server); // In appropriate logical group
```

**Step 4: Add Tests**
```typescript
// __tests__/new-feature.test.ts
// Unit tests for tool logic
// Mock dependencies and verify behavior
// Test edge cases and error conditions
```

### Best Practices

**Input Validation**:
- Always use Zod schemas with descriptive `.describe()` documentation
- Validate required fields and provide meaningful error messages
- Handle optional parameters with sensible defaults
- Consider parameter combinations and validation dependencies

**Slack API Integration**:
- Use existing `slackClient` methods when available for consistency
- Handle pagination for large datasets (channels with many messages)
- Respect rate limits and implement appropriate delays between calls
- Include context in error messages (channel ID, user ID, etc.)

**Database Interactions**:
- Always persist retrieved data for conversation context maintenance
- Use repository methods instead of direct SQL for consistency
- Handle foreign key relationships properly (store parent records first)
- Include appropriate error handling for database failures

**Response Design**:
- Return raw Slack objects when comprehensive analysis is needed
- Create simplified representations for lists and summaries to reduce payload size
- Include relevant metadata (timestamps, IDs, relationships) for context
- Use consistent naming conventions across all tool responses

**Error Handling**:
- Let `toolWrapper` handle standard error scenarios (logging, classification)
- Throw descriptive errors for validation and business logic failures
- Provide meaningful fallback responses when partial data is available
- Document expected error conditions in tool descriptions

### Performance Considerations

**API Call Optimization**:
- Batch user profile requests using `Promise.all` for parallel processing
- Cache frequently accessed metadata (channel names, user display names)
- Implement pagination for tools handling large message sets
- Use appropriate `limit` parameters to control data volume

**Database Efficiency**:
- Use connection pooling for concurrent operations
- Batch database inserts when processing multiple records
- Index frequently queried fields (timestamps, user IDs, status)
- Consider database transactions for related operations

**Memory Management**:
- Stream large message sets instead of loading everything into memory
- Use generators for processing large conversation histories
- Implement cleanup for temporary data structures
- Monitor memory usage during long-running tool executions

## Security Guidelines

### Input Sanitization

**Zod Validation**:
- Validate all string inputs for length and content restrictions
- Sanitize user-generated content before database storage
- Validate numeric parameters for reasonable ranges
- Handle malformed JSON or unexpected data types gracefully

**SQL Injection Prevention**:
- All database operations use parameterized queries exclusively
- Never construct SQL strings from user input
- Use repository methods that handle parameterization internally
- Validate foreign key relationships before database operations

### API Security

**Slack Token Protection**:
- Never log bot tokens or include in error messages
- Use environment variables with proper `.gitignore` exclusion
- Rotate tokens regularly through Slack app management
- Implement token validation on startup

**Rate Limiting**:
- Respect Slack API rate limits to prevent account suspension
- Implement client-side delays between consecutive API calls
- Handle 429 errors with exponential backoff retry logic
- Monitor API usage patterns for abuse detection

### Data Privacy

**Conversation Data**:
- Sanitize personally identifiable information from logs
- Respect Slack's data retention and export policies
- Implement data deletion workflows for compliance requirements
- Document data retention policies for stored conversation history

**Channel Access**:
- Only access channels where the bot has been explicitly invited
- Handle private channel access errors gracefully
- Never attempt to access restricted or archived channels
- Document bot permission requirements for workspace administrators

## Common Integration Patterns

### Conversation Context Preservation

**Message Retrieval + Persistence**:
```typescript
// Pattern used across multiple tools for maintaining conversation state
async function processConversation(channelId: string, limit: number = 100) {
  // Retrieve messages from Slack
  const messages = await slackClient.getChannelHistory(channelId, limit);
  
  // Ensure channel metadata is current
  const channel = await contextRepository.storeChannel({
    id: channelId,
    name: await getChannelName(channelId),  // Helper function
    is_private: await isPrivateChannel(channelId)
  });
  
  // Persist messages with proper relationships
  for (const message of messages) {
    await contextRepository.storeMessage(message, channel.id);
  }
  
  return messages; // For tool response
}
```

### Action Item Extraction + Follow-up

**Pattern for AI-Generated Tasks**:
```typescript
// Extracted from meeting analysis or conversation processing
const extractedAction = {
  description: 'Review the Q3 financial projections and prepare presentation slides',
  assignee: 'U1234567890',  // Detected from @mention or conversation context
  due_date: '2024-03-20T17:00:00.000Z',  // Parsed from natural language
  channel_id: 'C0987654321'  // Context from conversation
};

// Create trackable action item
await contextRepository.storeActionItem(extractedAction, channelId);

// Generate immediate notification
const notification = generateSlackNotification(extractedAction);
await slackClient.postMessage(channelId, notification);

// Return confirmation for AI agent
return { action_item_id: createdId, status: 'created', notification_sent: true };
```

### Error Recovery Patterns

**Graceful Degradation**:
```typescript
async function robustToolExecution(params: any) {
  try {
    // Primary workflow
    const slackData = await slackClient.getChannelHistory(params.channel_id, 100);
    const processed = await analyzeConversation(slackData);
    await contextRepository.storeAnalysis(processed);
    return formatSuccessResponse(processed);
  } catch (slackError) {
    // Fallback: Use cached data if available
    if (slackError.code === 'rate_limited') {
      console.warn('Slack rate limited, using cached conversation data');
      const cached = await contextRepository.getRecentMessages(params.channel_id, 100);
      if (cached.length > 0) {
        return formatCachedResponse(cached);
      }
    }
    // Re-throw for toolWrapper handling
    throw slackError;
  }
}
```

## Tool-Specific Documentation

For detailed implementation of individual tools, see the comprehensive JSDoc comments in each tool file. Key files to review:

- **`channel.ts`**: Channel discovery and metadata operations
- **`message.ts`**: Core conversation retrieval and posting functionality  
- **`notes.ts`**: AI-assisted meeting analysis and action extraction
- **`follow-up.ts`**: Action item lifecycle management and reminders
- **`search.ts`**: Workspace content discovery and filtering

Each tool file includes:
- Complete parameter documentation with Zod schemas
- Implementation details and integration points
- Error handling strategies and fallback behaviors
- Usage examples and response formats
- Performance considerations and optimization tips

## Contribution Guidelines

### Adding New Tool Categories

1. **Define Tool Specification**:
   - Document required functionality and use cases
   - Identify integration points (Slack API, database, external services)
   - Specify input parameters and validation requirements
   - Define expected output format and success criteria

2. **Create Tool File**:
   ```typescript
   // tools/new-category.ts
   import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
   import { z } from 'zod';
   import { toolWrapper } from './errors';
   import { slackClient } from '../../slack/client';
   
   export function registerNewCategoryTools(server: McpServer) {
     // Implement tools following established patterns
   }
   ```

3. **Register Globally**:
   ```typescript
   // tools/index.ts
   import { registerNewCategoryTools } from './new-category';
   
   // Add to registerAllTools() in appropriate logical group
   registerNewCategoryTools(server);
   ```

4. **Add Tests**:
   ```typescript
   // __tests__/new-category.test.ts
   // Unit tests for tool logic and integration points
   // Mock dependencies and verify expected behavior
   ```

### Code Review Checklist

- [ ] All inputs validated with Zod schemas and descriptive documentation
- [ ] toolWrapper used for consistent error handling
- [ ] Slack
