# SmartIntern MCP Server - Source Code

## Overview

This directory contains the complete source code for the SmartIntern MCP (Model Context Protocol) server. The server provides AI-assisted Slack integration tools for channel management, message analysis, meeting notes generation, action item tracking, and automated follow-ups. Built with TypeScript, it uses PostgreSQL for data persistence and integrates with the Slack API for workspace operations.

The architecture follows a layered approach:
- **Configuration Layer**: Environment setup and validation
- **Data Layer**: PostgreSQL database models and repository pattern
- **Integration Layer**: Slack API client for workspace interactions
- **MCP Layer**: Tool registration and server implementation
- **Entry Point**: Application startup and orchestration

## Key Files

- **`index.ts`**: Main entry point orchestrating startup sequence (config validation → database init → MCP server launch)
- **`config.ts`**: Environment variable loading and configuration validation (Slack tokens, database credentials)
- **`db/`**: Database layer with models and repository implementation
- **`mcp/`**: MCP server setup and tool definitions
- **`slack/`**: Slack API client for channel, message, and user operations
- **`events/`**: Event handling (if implemented)

## Directory Structure

```
src/
├── config.ts                 # Environment configuration and validation
├── index.ts                  # Application entry point
├── db/
│   ├── models.ts             # Database connection pool and table initialization
│   └── repository.ts         # Data access layer (CRUD operations)
├── mcp/
│   ├── server.ts             # MCP server creation and tool registration
│   └── tools/                # Individual MCP tool implementations
│       ├── index.ts          # Central tool registry
│       ├── channel.ts        # Channel listing and info tools
│       ├── message.ts        # Message retrieval and posting tools
│       ├── notes.ts          # Meeting analysis and action item extraction
│       ├── follow-up.ts      # Action item creation and reminder tools
│       ├── [other tools...]  # Additional functionality (bookmarks, search, etc.)
│       ├── errors.ts         # Tool error handling wrapper
│       └── __tests__/        # Unit tests for tools
└── slack/
    └── client.ts             # Slack WebClient wrapper with common operations
```

## Component Interactions

1. **Startup Flow** (`index.ts`):
   - Validates configuration from `.env` via `config.ts`
   - Initializes PostgreSQL tables via `db/models.ts`
   - Creates MCP server via `mcp/server.ts` and registers tools via `mcp/tools/index.ts`

2. **Tool Execution Flow**:
   - MCP server receives tool call from AI agent
   - Tool implementation (e.g., `mcp/tools/message.ts`) validates input with Zod
   - Calls Slack API via `slack/client.ts` for data retrieval
   - Persists data to PostgreSQL via `db/repository.ts`
   - Returns JSON-formatted response for AI consumption

3. **Data Flow**:
   - Slack API → `slack/client.ts` → Raw data objects
   - Data objects → `db/repository.ts` → PostgreSQL tables (channels, messages, action_items)
   - Extracted insights → Tool response → AI agent

## Usage Examples

### Running the Server
```bash
# Ensure .env file has required variables (SLACK_BOT_TOKEN, DB_PASSWORD, etc.)
npm run dev
```

### Tool Registration
Tools are automatically registered when the MCP server starts. AI agents can call tools like:
- `list_channels`: Get workspace channel overview
- `get_channel_history`: Retrieve conversation context
- `create_follow_up`: Generate action items from discussions
- `create_meeting_notes`: Auto-generate meeting summaries

## Database Schema

The PostgreSQL database stores:
- **channels**: Slack channel metadata (id, name, privacy)
- **messages**: Conversation history with timestamps and user info
- **meeting_notes**: Generated summaries with JSONB action items/decisions
- **action_items**: Trackable tasks with assignees and due dates
- **topics/message_topics**: Conversation categorization (future enhancement)

## Development Notes

- **Error Handling**: All tools use `toolWrapper` from `mcp/tools/errors.ts` for consistent error management
- **Rate Limiting**: Slack API calls respect rate limits; consider adding caching for frequently accessed data
- **Data Persistence**: All retrieved Slack data is cached in database for conversation context across tool calls
- **Security**: Uses parameterized SQL queries to prevent injection; validates all tool inputs with Zod schemas
- **Scalability**: Connection pooling via `pg.Pool` for concurrent database operations

## Testing

Unit tests for individual tools are located in `mcp/tools/__tests__/`. Integration tests should verify:
- End-to-end tool execution with mock Slack API responses
- Database schema integrity and foreign key constraints
- Error handling for invalid inputs and API failures

For comprehensive documentation of individual components, see the JSDoc comments in each TypeScript file.
