import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBookmarkTools } from './bookmarks';
import { registerCanvasTools } from './canvases';
import { registerChannelTools } from './channel';
import { registerMessageEnhancementTools } from './enhancement';
import { registerFileTools } from './file';
import { registerFollowUpTools } from './follow-up';
import { registerMessageTools } from './message';
import { registerNoteTools } from './notes';
import { registerReactionTools } from './reaction';
import { registerReminderTools } from './reminders';
import { registerSearchTools } from './search';
import { registerWorkspaceTools } from './workspace';

export function registerAllTools(server: McpServer) {
  registerBookmarkTools(server);
  registerCanvasTools(server);
  registerChannelTools(server);
  registerMessageEnhancementTools(server);
  registerFileTools(server);
  registerFollowUpTools(server);
  registerMessageTools(server);
  registerNoteTools(server);
  registerReactionTools(server);
  registerReminderTools(server);
  registerSearchTools(server);
  registerWorkspaceTools(server);
}
