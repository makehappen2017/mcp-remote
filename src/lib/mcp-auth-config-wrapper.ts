/**
 * Wrapper that switches between file and database storage based on environment
 */

// Check if we should use database storage
const USE_DATABASE = process.env.MCP_STORAGE_TYPE === 'database'

// Export either database or file implementation
export * from USE_DATABASE ? './mcp-auth-config-database' : './mcp-auth-config'