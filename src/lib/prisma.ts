import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 : PrismaClient exige desormais un driver adapter explicite,
// il ne lit plus l'URL directement depuis schema.prisma.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Evite de recreer une connexion Prisma a chaque hot-reload en dev.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
