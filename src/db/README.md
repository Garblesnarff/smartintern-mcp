# Database Layer - PostgreSQL Data Access

## Overview

The `db/` directory implements the data persistence layer for the SmartIntern MCP server. It provides PostgreSQL connection management, schema initialization, and a repository pattern for CRUD operations on Slack-related data. The layer ensures data integrity through foreign key relationships and supports conversation context across MCP tool executions.

**Key Responsibilities:**
- Database connection pooling for concurrent operations
- Automatic table creation and schema management
- Structured data storage for channels, messages, meeting notes, and action items
- Type-safe data access methods with error handling
- Support for JSONB storage of complex data (action items, decisions)

## Key Files

- **`models.ts`**: Database connection pool and table initialization logic
- **`repository.ts`**: ContextRepository class with CRUD operations for application data

## Table Schema

The database schema supports the complete Slack integration workflow:

### Core Tables

**`channels`** - Slack channel metadata
- `id` (SERIAL PRIMARY KEY): Internal database identifier
- `slack_id` (TEXT UNIQUE NOT NULL): Slack channel ID (e.g., "C1234567890")
- `name` (TEXT NOT NULL): Channel name (e.g., "general", "project-alpha")
- `is_private` (BOOLEAN NOT NULL): Channel visibility (true for private channels)
- `created_at` (TIMESTAMP DEFAULT NOW()): Record creation timestamp

**`messages`** - Slack message content and metadata
- `id` (SERIAL PRIMARY KEY): Internal database identifier
- `slack_id` (TEXT UNIQUE NOT NULL): Slack message timestamp (e.g., "1234567890.123456")
- `channel_id` (INTEGER REFERENCES channels(id)): Foreign key to channel
- `user_id` (TEXT NOT NULL): Slack user ID (e.g., "U1234567890")
- `text` (TEXT NOT NULL): Message content
- `timestamp` (TIMESTAMP NOT NULL): Message send time (converted from Slack format)
- `thread_ts` (TEXT): Parent message timestamp for threaded replies
- `has_attachments` (BOOLEAN DEFAULT FALSE): Presence of file attachments
- `created_at` (TIMESTAMP DEFAULT NOW()): Record creation timestamp

### Meeting and Action Tracking

**`meeting_notes`** - AI-generated meeting summaries
- `id` (SERIAL PRIMARY KEY): Internal database identifier
- `title` (TEXT NOT NULL): Meeting title (e.g., "Q3 Planning Session")
- `summary` (TEXT NOT NULL): Generated meeting summary with markdown formatting
- `channel_id` (INTEGER REFERENCES channels(id)): Meeting channel
- `start_ts` (TEXT NOT NULL): Meeting start timestamp (Slack format)
- `end_ts` (TEXT NOT NULL): Meeting end timestamp (Slack format)
- `participants` (TEXT[]): Array of participant display names
- `action_items` (JSONB): Structured array of extracted action items
- `decisions` (JSONB): Structured array of identified decisions
- `created_at` (TIMESTAMP DEFAULT NOW()): Record creation timestamp

**`action_items`** - Trackable tasks and follow-ups
- `id` (SERIAL PRIMARY KEY): Internal database identifier
- `description` (TEXT NOT NULL): Task description from conversation analysis
- `assignee` (TEXT): Slack user ID of assigned person (nullable)
- `due_date` (TIMESTAMP): Optional completion deadline
- `status` (TEXT DEFAULT 'open'): Task status ('open', 'completed', 'blocked')
- `channel_id` (INTEGER REFERENCES channels(id)): Context channel
- `message_id` (INTEGER REFERENCES messages(id)): Source message (nullable)
- `created_at` (TIMESTAMP DEFAULT NOW()): Record creation timestamp

### Analysis Support (Future Enhancement)

**`topics`** - Conversation topic classification
- `id` (SERIAL PRIMARY KEY): Internal database identifier
- `name` (TEXT NOT NULL): Topic name (e.g., "project-planning", "bug-fixes")
- `description` (TEXT): Topic description
- `created_at` (TIMESTAMP DEFAULT NOW()): Record creation timestamp

**`message_topics`** - Many-to-many message-topic relationships
- `message_id` (INTEGER REFERENCES messages(id)): Foreign key to message
- `topic_id` (INTEGER REFERENCES topics(id)): Foreign key to topic
- `PRIMARY KEY (message_id, topic_id)`: Composite unique constraint

## Component Interactions

### Database Initialization (`models.ts`)

**Purpose**: Establishes connection pool and creates tables on startup

**Flow**:
1. Creates `Pool` instance using database configuration from `src/config.ts`
2. Executes multi-statement SQL to create all tables with `IF NOT EXISTS`
3. Establishes foreign key relationships for data integrity
4. Handles connection lifecycle with try-catch-finally for cleanup

**Usage**:
```typescript
import { initializeDatabase } from './db/models';
await initializeDatabase(); // Called during application startup
```

### Data Access Layer (`repository.ts`)

**Purpose**: Encapsulates all database operations using repository pattern

**Key Methods**:

**Channel Operations**:
- `storeChannel(channelData)`: UPSERT channel metadata (insert or update by slack_id)
- Returns database record with internal ID for foreign key references

**Message Operations**:
- `storeMessage(messageData, channelId)`: Persists Slack messages with timestamp conversion
- Handles thread tracking and attachment detection
- UPSERT by slack_id to handle message edits

**Meeting Operations**:
- `storeMeetingNotes(notesData, channelId)`: Stores AI-generated summaries as JSONB
- Supports flexible action items and decisions storage
- Links to channel for context

**Action Item Operations**:
- `storeActionItem(actionItem, channelId, messageId?)`: Creates trackable tasks
- Supports assignee tracking, due dates, and status management
- Optional message linking for source context

**Query Operations**:
- `getRecentMessages(channelId, limit?)`: Retrieves conversation history
- `getActionItems(status?)`: Fetches tasks with optional status filtering
- Includes JOINs for contextual information (channel names)

**Singleton Pattern**: 
- `contextRepository` exported as single instance for consistent access
- Prevents multiple repository objects and ensures centralized connection management

## Usage Examples

### Storing Conversation Context
```typescript
import { contextRepository } from './db/repository';
import { slackClient } from '../slack/client';

// Store channel metadata
const channel = await contextRepository.storeChannel({
  id: 'C1234567890',
  name: 'general',
  is_private: false
});

// Store messages from conversation
const messages = await slackClient.getChannelHistory('C1234567890', 100);
for (const msg of messages) {
  await contextRepository.storeMessage(msg, channel.id);
}
```

### Creating Action Items from Analysis
```typescript
// Extracted from meeting analysis
const actionItem = {
  description: 'Review Q3 financial report and prepare presentation',
  assignee: 'U0987654321',
  due_date: '2024-03-15T17:00:00.000Z'
};

// Store action item linked to channel
await contextRepository.storeActionItem(actionItem, channelId);

// Later, retrieve open action items
const openItems = await contextRepository.getActionItems('open');
```

### Meeting Notes Storage
```typescript
const meetingNotes = {
  title: 'Weekly Product Sync - March 8, 2024',
  summary: 'Generated meeting summary with discussion points...',
  start_ts: '1709875200.000000',
  end_ts: '1709878800.999999',
  participants: ['John Doe', 'Jane Smith', 'Bob Johnson'],
  action_items: [
    { description: 'Update product roadmap', assignee: 'U123' },
    { description: 'Prepare customer demo', assignee: 'U456' }
  ],
  decisions: [
    { text: 'Approved new feature priority', user: 'U789' }
  ]
};

// Store structured meeting data
await contextRepository.storeMeetingNotes(meetingNotes, channelId);
```

## Error Handling

All repository methods include comprehensive error handling:
- Connection acquisition failures are logged and re-thrown
- SQL errors are captured with descriptive logging
- Client connections always released in `finally` blocks
- Invalid data validation prevents database corruption

## Performance Considerations

- **Connection Pooling**: `pg.Pool` manages concurrent connections efficiently
- **Parameterized Queries**: Prevents SQL injection and enables query plan caching
- **Batch Operations**: Multiple messages processed in single transaction when possible
- **Indexing**: Database indexes on foreign keys and timestamps for fast queries
- **JSONB Storage**: Efficient querying of action items and decisions with PostgreSQL's JSON operators

## Security Notes

- **Input Sanitization**: All user inputs validated through Zod schemas before database operations
- **Parameterized Queries**: Prevents SQL injection attacks using `$1`, `$2` placeholders
- **Foreign Key Constraints**: Maintains referential integrity at database level
- **Connection Security**: Uses SSL/TLS for PostgreSQL connections (configurable)
- **Data Isolation**: Private channel data access controlled by Slack bot permissions

For detailed implementation and method documentation, see the JSDoc comments in `models.ts` and `repository.ts`.
