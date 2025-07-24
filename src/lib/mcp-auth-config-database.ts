/**
 * Database Storage Adapter for MCP Remote Authentication
 * 
 * This module replaces file-based storage with database storage for better
 * security and multi-tenant support in SaaS environments.
 */

import { getPrismaClient } from './database-prisma-client'
import * as crypto from 'crypto'
import { log } from './utils'

// Simple encryption/decryption for tokens
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-production'

/**
 * Encrypt data using AES-256-GCM
 */
async function encrypt(text: string, userId: string): Promise<string> {
  const key = crypto.createHash('sha256')
    .update(ENCRYPTION_KEY + userId)
    .digest()
  
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

/**
 * Decrypt data using AES-256-GCM
 */
async function decrypt(encryptedData: string, userId: string): Promise<string> {
  const parts = encryptedData.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]
  
  const key = crypto.createHash('sha256')
    .update(ENCRYPTION_KEY + userId)
    .digest()
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

// Environment variables for database mode
const DB_MODE = process.env.MCP_STORAGE_TYPE === 'database'
const USER_ID = process.env.MCP_USER_ID
const CONNECTION_ID = process.env.MCP_CONNECTION_ID

// Cache for performance
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5000 // 5 seconds

/**
 * Database-backed storage for MCP authentication
 */
export class DatabaseStorage {
  constructor(
    private userId: string,
    private connectionId: string
  ) {}

  /**
   * Get cache key
   */
  private getCacheKey(serverUrlHash: string, filename: string): string {
    return `${this.userId}:${this.connectionId}:${serverUrlHash}:${filename}`
  }

  /**
   * Check cache
   */
  private getFromCache(key: string): any | null {
    const cached = cache.get(key)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data
    }
    cache.delete(key)
    return null
  }

  /**
   * Set cache
   */
  private setCache(key: string, data: any): void {
    cache.set(key, { data, timestamp: Date.now() })
  }

  /**
   * Read JSON data from database
   */
  async readJson(serverUrlHash: string, filename: string): Promise<any | undefined> {
    const cacheKey = this.getCacheKey(serverUrlHash, filename)
    
    // Check cache first
    const cached = this.getFromCache(cacheKey)
    if (cached !== null) {
      return cached
    }

    try {
      if (filename === 'tokens.json') {
        const prisma = getPrismaClient()
      const record = await prisma.mCPRemoteToken.findUnique({
          where: {
            userId_connectionId_serverHash: {
              userId: this.userId,
              connectionId: this.connectionId,
              serverHash: serverUrlHash
            }
          }
        })

        if (!record) return undefined

        const decrypted = await decrypt(record.tokenData, this.userId)
        const data = JSON.parse(decrypted)
        
        this.setCache(cacheKey, data)
        return data
      }
      
      if (filename === 'client_info.json') {
        const record = await prisma.mCPRemoteClientInfo.findUnique({
          where: {
            serverUrl: serverUrlHash // Using hash as unique identifier
          }
        })

        if (!record) return undefined

        const data = JSON.parse(record.clientData)
        this.setCache(cacheKey, data)
        return data
      }

      // For other files, use a generic storage table
      const record = await prisma.mCPRemoteStorage.findUnique({
        where: {
          userId_connectionId_key: {
            userId: this.userId,
            connectionId: this.connectionId,
            key: `${serverUrlHash}_${filename}`
          }
        }
      })

      if (!record) return undefined

      const data = JSON.parse(record.value)
      this.setCache(cacheKey, data)
      return data

    } catch (error) {
      log(`Error reading ${filename} from database:`, error)
      return undefined
    }
  }

  /**
   * Write JSON data to database
   */
  async writeJson(serverUrlHash: string, filename: string, data: any): Promise<void> {
    const cacheKey = this.getCacheKey(serverUrlHash, filename)
    
    try {
      if (filename === 'tokens.json') {
        const encrypted = await encrypt(JSON.stringify(data), this.userId)
        
        await prisma.mCPRemoteToken.upsert({
          where: {
            userId_connectionId_serverHash: {
              userId: this.userId,
              connectionId: this.connectionId,
              serverHash: serverUrlHash
            }
          },
          create: {
            userId: this.userId,
            connectionId: this.connectionId,
            serverHash: serverUrlHash,
            serverUrl: '', // Will be set by caller
            tokenData: encrypted,
            tokenType: data.token_type || 'oauth'
          },
          update: {
            tokenData: encrypted,
            lastUpdated: new Date()
          }
        })
        
        this.setCache(cacheKey, data)
        return
      }

      if (filename === 'client_info.json') {
        await prisma.mCPRemoteClientInfo.upsert({
          where: {
            serverUrl: serverUrlHash
          },
          create: {
            serverUrl: serverUrlHash,
            clientData: JSON.stringify(data)
          },
          update: {
            clientData: JSON.stringify(data),
            updatedAt: new Date()
          }
        })
        
        this.setCache(cacheKey, data)
        return
      }

      // For other files, use generic storage
      await prisma.mCPRemoteStorage.upsert({
        where: {
          userId_connectionId_key: {
            userId: this.userId,
            connectionId: this.connectionId,
            key: `${serverUrlHash}_${filename}`
          }
        },
        create: {
          userId: this.userId,
          connectionId: this.connectionId,
          key: `${serverUrlHash}_${filename}`,
          value: JSON.stringify(data)
        },
        update: {
          value: JSON.stringify(data),
          updatedAt: new Date()
        }
      })
      
      this.setCache(cacheKey, data)

    } catch (error) {
      log(`Error writing ${filename} to database:`, error)
      throw error
    }
  }

  /**
   * Read text data from database
   */
  async readText(serverUrlHash: string, filename: string): Promise<string> {
    const data = await this.readJson(serverUrlHash, filename)
    if (!data || typeof data !== 'string') {
      throw new Error(`Error reading ${filename}`)
    }
    return data
  }

  /**
   * Write text data to database
   */
  async writeText(serverUrlHash: string, filename: string, text: string): Promise<void> {
    await this.writeJson(serverUrlHash, filename, text)
  }

  /**
   * Delete data from database
   */
  async delete(serverUrlHash: string, filename: string): Promise<void> {
    const cacheKey = this.getCacheKey(serverUrlHash, filename)
    cache.delete(cacheKey)

    try {
      if (filename === 'tokens.json') {
        await prisma.mCPRemoteToken.delete({
          where: {
            userId_connectionId_serverHash: {
              userId: this.userId,
              connectionId: this.connectionId,
              serverHash: serverUrlHash
            }
          }
        })
        return
      }

      if (filename === 'client_info.json') {
        await prisma.mCPRemoteClientInfo.delete({
          where: {
            serverUrl: serverUrlHash
          }
        })
        return
      }

      // For other files
      await prisma.mCPRemoteStorage.delete({
        where: {
          userId_connectionId_key: {
            userId: this.userId,
            connectionId: this.connectionId,
            key: `${serverUrlHash}_${filename}`
          }
        }
      })
    } catch (error) {
      // Ignore if doesn't exist
      if ((error as any).code !== 'P2025') {
        log(`Error deleting ${filename}:`, error)
      }
    }
  }
}

// Global storage instance
let storageInstance: DatabaseStorage | null = null

/**
 * Get storage instance for current context
 */
function getStorage(): DatabaseStorage | null {
  if (!DB_MODE || !USER_ID || !CONNECTION_ID) {
    return null
  }
  
  if (!storageInstance) {
    storageInstance = new DatabaseStorage(USER_ID, CONNECTION_ID)
  }
  
  return storageInstance
}

// Export wrapped functions that use database when available, fall back to files
export { 
  createLockfile,
  checkLockfile,
  deleteLockfile,
  getConfigDir,
  ensureConfigDir,
  getConfigFilePath,
  deleteConfigFile
} from './mcp-auth-config'

// Import original functions for fallback
import {
  readJsonFile as fileReadJsonFile,
  writeJsonFile as fileWriteJsonFile,
  readTextFile as fileReadTextFile,
  writeTextFile as fileWriteTextFile,
  deleteConfigFile as fileDeleteConfigFile
} from './mcp-auth-config'

/**
 * Read JSON file with database support
 */
export async function readJsonFile<T>(serverUrlHash: string, filename: string, schema: any): Promise<T | undefined> {
  const storage = getStorage()
  
  if (storage) {
    try {
      const data = await storage.readJson(serverUrlHash, filename)
      if (!data) return undefined
      
      // Validate with schema
      const result = await schema.parseAsync(data)
      return result
    } catch (error) {
      log(`Database read error for ${filename}:`, error)
      return undefined
    }
  }
  
  // Fall back to file storage
  return fileReadJsonFile<T>(serverUrlHash, filename, schema)
}

/**
 * Write JSON file with database support
 */
export async function writeJsonFile(serverUrlHash: string, filename: string, data: any): Promise<void> {
  const storage = getStorage()
  
  if (storage) {
    await storage.writeJson(serverUrlHash, filename, data)
    return
  }
  
  // Fall back to file storage
  return fileWriteJsonFile(serverUrlHash, filename, data)
}

/**
 * Read text file with database support
 */
export async function readTextFile(serverUrlHash: string, filename: string, errorMessage?: string): Promise<string> {
  const storage = getStorage()
  
  if (storage) {
    try {
      return await storage.readText(serverUrlHash, filename)
    } catch (error) {
      throw new Error(errorMessage || `Error reading ${filename}`)
    }
  }
  
  // Fall back to file storage
  return fileReadTextFile(serverUrlHash, filename, errorMessage)
}

/**
 * Write text file with database support
 */
export async function writeTextFile(serverUrlHash: string, filename: string, text: string): Promise<void> {
  const storage = getStorage()
  
  if (storage) {
    await storage.writeText(serverUrlHash, filename, text)
    return
  }
  
  // Fall back to file storage
  return fileWriteTextFile(serverUrlHash, filename, text)
}