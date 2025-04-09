# SmartIntern MCP Server

SmartIntern is a Model Context Protocol (MCP) server that connects AI assistants like Claude to Slack, providing context-aware functionality for meeting notes, follow-ups, and insights.

## Features

- **Channel Interaction**: List channels, get channel information
- **Message Access**: Retrieve conversation history, thread replies
- **Meeting Notes**: Generate and post meeting notes from conversations
- **Action Items**: Extract, track, and follow up on action items
- **Follow-up Management**: Create follow-ups, track status, send reminders

## Prerequisites

- Node.js (v18+)
- PostgreSQL database
- Slack Bot Token with appropriate permissions

## Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/smartintern-mcp.git
   cd smartintern-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your Slack and database credentials.

5. Build the project:
   ```bash
   npm run build
   ```

## Setting up Slack Integration

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Add the following Bot Token Scopes:
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `groups:history`
   - `groups:read`
   - `im:history`
   - `users:read`
   - `reactions:read`
   - `files:read`
3. Install the app to your workspace
4. Copy the Bot User OAuth Token to your `.env` file

## Running the Server

```bash
npm start
```

## Usage with Claude

To use SmartIntern with Claude's desktop app, add the following configuration to your `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "smartintern": {
      "command": "node",
      "args": ["/path/to/smartintern-mcp/dist/index.js"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token-here",
        "SLACK_SIGNING_SECRET": "your-signing-secret-here"
      }
    }
  }
}
```

## MCP Tools

SmartIntern provides several tools for AI assistants:

### Channel Tools
- `list_channels`: List available Slack channels
- `get_channel_info`: Get detailed information about a specific channel

### Message Tools
- `get_channel_history`: Get recent messages from a channel
- `get_thread_replies`: Get replies in a conversation thread
- `send_message`: Send a message to a channel or thread

### Note Tools
- `create_meeting_notes`: Create and post meeting notes from a conversation
- `extract_action_items`: Extract action items from a conversation

### Follow-up Tools
- `create_follow_up`: Create a follow-up reminder for an action item
- `track_follow_up_status`: Get or update the status of follow-ups
- `remind_action_items`: Send reminders for open action items

## License

MIT
