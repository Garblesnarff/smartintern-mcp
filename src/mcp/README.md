# MCP Server - Model Context Protocol Implementation

## Overview

The `mcp/` directory implements the core Model Context Protocol (MCP) server functionality for the SmartIntern application. This layer handles tool registration, server lifecycle management, and integration between external AI agents and Slack workspace operations. The MCP server exposes a standardized interface for AI tools to interact with Slack channels, messages, meetings, and action items.

**Key Responsibilities:**
- MCP server creation and configuration using `@modelcontextprotocol/sdk`
- Registration of all application tools with input validation schemas
- Stdio transport for communication with host environments
- Error handling and logging for tool execution
- Integration between Slack API, database persistence, and AI tool responses

## Key Files

- **`server.ts`**: MCP server creation, tool registration orchestration, and stdio transport setup
- **`tools/`**: Individual tool implementations and registration functions

## MCP Server Lifecycle

### Startup Flow (`server.ts`)

**Purpose**: Creates and starts the MCP server with all tools registered

**Process**:
1. **Server Creation**: Instantiates `McpServer` with application metadata (name, version, description) from configuration
2. **Tool Registration**: Calls `registerAllTools()` to add all application tools to the server
3. **Transport Connection**: Establishes stdio transport for communication with host environment
4. **Server Start**: Connects transport and makes tools available for execution

**Configuration**:
```typescript
const server = new McpServer({
  name: config.server.name,        // "SmartIntern"
  version: config.server.version,  // "1.0.0"
  description: config.server.description  // "MCP server for Slack integration..."
});
```

**Transport**:
- Uses `StdioServerTransport` for standard input/output communication
- Suitable for development and hosted environments
- Enables real-time tool execution by external AI agents

## Tool Registration System

### Central Registry (`tools/index.ts`)

**Purpose**: Orchestrates registration of all 12+ tool categories in logical groups

**Registration Categories**:

**Core Slack Tools** (Fundamental operations):
- `channel.ts`: Channel listing (`list_channels`) and detailed info (`get_channel_info`)
- `message.ts`: Message history (`get_channel_history`), thread replies (`get_thread_replies`), posting (`send_message`)
- `file.ts`: File operations and attachment handling

**Productivity Tools** (Collaboration features):
- `notes.ts`: Meeting analysis (`create_meeting_notes`), action extraction (`extract_action_items`)
- `follow-up.ts`: Action creation (`create_follow_up`), status tracking (`track_follow_up_status`), reminders (`remind_action_items`)
- `reminders.ts`: Scheduled reminder management

**Analysis Tools** (Content processing):
- `enhancement.ts`: Message enhancement and summarization
- `search.ts`: Workspace content search and filtering
- `reaction.ts`: Message reaction analysis and sentiment tracking

**Workspace Tools** (Advanced features):
- `workspace.ts`: Workspace configuration and management
- `bookmarks.ts`: Important message and channel bookmarking
- `canvases.ts`: Slack Canvas integration for structured content

### Tool Implementation Pattern

Each tool file follows a consistent structure:

**1. Registration Function**:
```typescript
export function registerChannelTools(server: McpServer) {
  // Registers specific tools for this category
}
```

**2. Tool Definition** (using `server.tool()`):
```typescript
server.tool(
  'tool_name',                    // Unique tool identifier
  'Tool description...',          // Human-readable description
  {                              // Input schema with Zod validation
    channel_id: z.string().describe('Channel ID'),
    limit: z.number().optional().describe('Message limit')
  },
  toolWrapper('tool_name', async (params) => {
    // Tool implementation logic
    return { content: [{ type: 'text', text: jsonResponse }] };
  })
);
```

**3. Error Handling**:
- All tools wrapped with `toolWrapper` from `tools/errors.ts`
- Provides consistent error logging and standardized error responses
- Handles Slack API failures, database errors, and validation issues

## Tool Execution Flow

### Request Processing

1. **Tool Call**: AI agent sends tool request via MCP protocol
2. **Input Validation**: Zod schema validates parameters against tool definition
3. **Execution**: Tool implementation processes the request
4. **External Integrations**:
   - Slack API calls via `src/slack/client.ts`
   - Database operations via `src/db/repository.ts`
5. **Response Generation**: Returns JSON-formatted response with MCP content structure
6. **Persistence**: Retrieved data automatically cached in database for context

### Response Format

All tools return standardized MCP content:
```typescript
{
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(data, null, 2)  // Structured JSON for AI parsing
    }
  ]
}
```

**Data Types Returned**:
- Channel lists: Array of `{ id, name, is_private, num_members }`
- Message history: Raw Slack message objects with full metadata
- Action items: Array of `{ description, assignee, due_date, status }`
- Meeting notes: Complete summary objects with extracted insights

## Integration Architecture

### Slack Integration Flow

```
AI Agent → MCP Server → Tool Implementation → SlackClient → Slack API
                                                    ↓
                                             Database Persistence
                                                    ↓
                                        Tool Response → AI Agent
```

### Database Integration

**Persistence Strategy**:
- **All retrieved data** cached in database for conversation context
- **Channel metadata** stored on first access (UPSERT by slack_id)
- **Messages** persisted with timestamp conversion and thread linking
- **Action items** created from analysis with assignee tracking
- **Meeting notes** stored as JSONB for flexible querying

**Why Persist Everything?**
- Enables cross-tool conversation context (e.g., reference previous messages)
- Supports historical analysis and trend identification
- Provides backup of conversation data beyond Slack retention policies
- Allows complex queries across conversation time periods and channels

## Error Handling and Logging

### ToolWrapper (`tools/errors.ts`)

**Purpose**: Standardizes error handling across all tools

**Features**:
- **Consistent Logging**: Structured error messages with tool name and parameters
- **Error Classification**: Distinguishes between validation, API, and database errors
- **Graceful Degradation**: Provides meaningful responses even on partial failures
- **Retry Logic**: Basic retry mechanism for transient API failures

**Error Response Format**:
```json
{
  "error": {
    "type": "SLACK_API_ERROR",
    "message": "Channel not found",
    "tool": "get_channel_history",
    "parameters": { "channel_id": "C123" }
  }
}
```

## Development Guidelines

### Adding New Tools

1. **Create Tool File**: Add new file in `tools/` (e.g., `new-feature.ts`)
2. **Define Registration**: Export `registerNewFeatureTools(server: McpServer)`
3. **Implement Tools**: Use `server.tool()` with Zod schemas and toolWrapper
4. **Register Globally**: Add import and call in `tools/index.ts`
5. **Test Integration**: Verify Slack API calls, database persistence, and error handling

### Tool Best Practices

**Input Validation**:
- Use Zod schemas with `.describe()` for parameter documentation
- Validate required fields and provide sensible defaults
- Handle optional parameters gracefully

**Slack Integration**:
- Use existing `slackClient` methods when available
- Handle rate limiting and pagination for large datasets
- Respect Slack's data retention and access permissions

**Database Usage**:
- Always store retrieved Slack data for conversation context
- Use repository methods instead of direct SQL where possible
- Handle foreign key relationships properly (store channels before messages)

**Response Design**:
- Return raw Slack objects for comprehensive analysis
- Use JSON.stringify with formatting for readability
- Include relevant metadata (timestamps, IDs, user info)

## Testing Strategy

### Unit Tests (`tools/__tests__/`)

**Tool Implementation Tests**:
- Mock SlackClient and repository responses
- Test input validation with valid/invalid parameters
- Verify correct database calls and response formatting
- Test error conditions (API failures, validation errors)

**Integration Tests**:
- End-to-end tool execution with real database
- Mock external APIs (Slack, MCP protocol)
- Verify data persistence and retrieval consistency
- Test concurrent tool execution scenarios

### MCP Server Tests

- Verify all tools register correctly without conflicts
- Test server startup and shutdown sequences
- Validate stdio transport communication
- Ensure proper error propagation to calling agents

## Performance Considerations

- **Slack API Rate Limits**: Implement exponential backoff for retries
- **Database Connection Pool**: Configure pool size based on expected concurrency
- **Large Message Sets**: Implement pagination for tools handling many messages
- **JSONB Querying**: Use PostgreSQL JSON operators for efficient action item searches
- **Caching Strategy**: Consider Redis for frequently accessed channel/user metadata

## Security Considerations

- **Input Sanitization**: All tool parameters validated through Zod schemas
- **SQL Injection Prevention**: Uses parameterized queries exclusively
- **Slack Token Security**: Bot token stored in environment variables, never hardcoded
- **Data Access Control**: Respects Slack bot permissions and channel privacy
- **Audit Trail**: All database operations include creation timestamps

For detailed implementation documentation, see the comprehensive JSDoc comments in each tool file and the central registry in `tools/index.ts`.
