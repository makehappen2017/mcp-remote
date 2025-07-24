/**
 * Prisma Client Wrapper for MCP-Remote
 * 
 * This ensures we can connect to the database from within mcp-remote
 * without conflicts with the main application's Prisma instance
 */

import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient | null = null

/**
 * Get or create Prisma client instance
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    // Use database URL from environment
    const databaseUrl = process.env.DATABASE_URL
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for database storage mode')
    }
    
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      },
      log: process.env.MCP_REMOTE_DEBUG === 'true' 
        ? ['query', 'info', 'warn', 'error']
        : ['error']
    })
  }
  
  return prisma
}

/**
 * Disconnect Prisma client (for cleanup)
 */
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
  }
}

// Handle process termination
process.on('beforeExit', async () => {
  await disconnectPrisma()
})

process.on('SIGINT', async () => {
  await disconnectPrisma()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await disconnectPrisma()
  process.exit(0)
})