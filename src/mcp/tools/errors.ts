import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function toolWrapper<T extends (...args: any[]) => any>(
  name: string,
  fn: T,
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`Error in ${name} tool:`, error);
      if (error instanceof Error) {
        throw new Error(`Failed to ${name}: ${error.message}`);
      }
      throw new Error(`Failed to ${name}: ${String(error)}`);
    }
  };
}
