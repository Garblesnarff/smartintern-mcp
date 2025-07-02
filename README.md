### **SmartIntern MCP: AI-Powered Slack Collaboration with Persistent Memory**

`smartintern-mcp` transforms generic AI models into proactive digital teammates by solving a fundamental limitation: **AI memory loss**. While standard LLMs forget everything between conversations, this MCP server provides persistent PostgreSQL-backed memory that enables true collaboration within Slack workspaces.

**The Problem**: Traditional AI assistants can't remember yesterday's decisions, track ongoing projects, or understand workspace context across conversations.

**The Solution**: A dual-architecture system where real-time Slack event ingestion builds a comprehensive "world model" in a database, while MCP tools enable AI to query this memory and take intelligent actions. This creates the first steps toward genuine AI workplace consciousness—where models understand context, remember commitments, and proactively contribute to team productivity.

### **Key Features**

* **🧠 Persistent AI Memory**: Real-time Slack event ingestion into PostgreSQL creates comprehensive conversation history and workspace context
* **📝 Intelligent Meeting Synthesis**: Analyzes transcripts to generate structured summaries with extracted action items and key decisions  
* **✅ Proactive Task Management**: Creates, tracks, and sends reminders for action items identified directly from conversations
* **💬 Full Slack Integration**: Complete toolset for reading channels, managing threads, and sending contextual messages
* **🔒 Production-Ready**: TypeScript, Docker containerization, Slack Bolt SDK, and Zod validation for enterprise deployment
* **🤖 Multi-Agent Framework**: Foundation for exploring emergent collaborative behaviors between AI agents

### **Technology Stack**

* **Backend**: Node.js, TypeScript, Express.js
* **AI Integration**: Model Context Protocol (MCP) SDK
* **Database**: PostgreSQL (persistent memory layer)
* **Slack Integration**: Slack Bolt JS, Slack Web API
* **Validation**: Zod schema validation
* **Deployment**: Docker containerization

### **Quick Start**

**Prerequisites**: Node.js 18+, PostgreSQL, Slack App with Bot Token

```bash
# 1. Clone and configure
git clone [repo-url]
cp .env.example .env  # Fill in Slack and database credentials

# 2. Install and build
npm install
npm run build

# 3. Launch dual servers
npm start  # Starts both MCP server (AI interface) and Events server (memory ingestion)
