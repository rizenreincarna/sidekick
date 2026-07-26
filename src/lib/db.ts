import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Enable WAL mode for better concurrent read performance
// WAL mode is configured by the database provisioning/repair procedure. Do
// not execute PRAGMA journal_mode during module initialization: SQLite returns
// a result row for that statement, which Prisma rejects through executeRaw.
