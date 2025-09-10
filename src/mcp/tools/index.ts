/**
 * MCP TOOLS REGISTRATION - Central Tool Registry
 * 
 * This file serves as the central registry for all MCP tools in the SmartIntern
 * server. It imports registration functions from individual tool modules and
 * orchestrates their registration with the MCP server instance. Each tool provides
 * specific Slack integration capabilities like channel management, message handling,
 * notes, follow-ups, and workspace operations.
 * 
 * Tool Categories:
 * - Core Slack: Channel, message, file operations
 * - Productivity: Notes, action items, reminders, follow-ups
 * - Analysis: Search, enhancement, reactions
 * - Workspace: Canvas, bookmark, workspace management
 * 
 * Dependencies:
 * - @modelcontextprotocol/sdk/server/mcp.js: MCP server core
 * - Individual tool modules: ./channel.ts, ./message.ts, etc.
 * 
 * Registration Order: Tools are registered in logical groups for clarity,
 * but order doesn't affect functionality since MCP server handles them independently.
 * 
 * @author Cline (built by Oak AI)
 */

// ====================================
// Imports
// ====================================
// MCP SDK imports
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Core Slack tools
import { registerChannelTools } from './channel';
import { registerMessageTools } from './message';
import { registerFileTools } from './file';

// Productivity tools
import { registerNoteTools } from './notes';
import { registerFollowUpTools } from './follow-up';
import { registerReminderTools } from './reminders';

// Analysis and enhancement tools
import { registerMessageEnhancementTools } from './enhancement';
import { registerSearchTools } from './search';
import { registerReactionTools } from './reaction';

// Workspace management tools
import { registerWorkspaceTools } from './workspace';
import { registerBookmarkTools } from './bookmarks';
import { registerCanvasTools } from './canvases';

/**
 * Registers all MCP tools with the server instance.
 * 
 * This function orchestrates the registration of all available tools by calling
 * individual registration functions from each tool module. Each registration
 * adds one or more tools to the MCP server, making them available for execution
 * by external AI agents. The tools provide comprehensive Slack workspace integration.
 * 
 * Registration Process:
 * 1. Core Slack tools: Channel, message, file operations (fundamental operations)
 * 2. Productivity tools: Notes, follow-ups, reminders (collaboration features)
 * 3. Analysis tools: Enhancement, search, reactions (content processing)
 * 4. Workspace tools: Canvas, bookmarks, workspace management (advanced features)
 * 
 * Each tool module (e.g., ./message.ts) defines its own server.tool() calls with
 * schemas using Zod for input validation. See individual tool files for details.
 * 
 * @param {McpServer} server - The MCP server instance to register tools with
 * @returns {void}
 * 
 * @example
 * const server = new McpServer({ name: 'SmartIntern', version: '1.0.0' });
 * registerAllTools(server);
 * // All 12 tool categories now available via MCP protocol
 */
export function registerAllTools(server: McpServer) {
  // Register core Slack interaction tools
  // These provide basic workspace operations: channels, messages, files
  registerChannelTools(server);
  registerMessageTools(server);
  registerFileTools(server);

  // Register productivity and collaboration tools
  // These support meeting notes, action items, reminders, and follow-ups
  registerNoteTools(server);
  registerFollowUpTools(server);
  registerReminderTools(server);

  // Register analysis and content processing tools
  // These enhance messages, enable search, and handle reactions
  registerMessageEnhancementTools(server);
  registerSearchTools(server);
  registerReactionTools(server);

  // Register advanced workspace management tools
  // These handle canvas operations, bookmarks, and workspace configuration
  registerWorkspaceTools(server);
  registerBookmarkTools(server);
  registerCanvasTools(server);
}
