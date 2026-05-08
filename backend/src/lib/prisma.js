import { PrismaClient } from "@prisma/client";

let prisma;

try {
  prisma = new PrismaClient();
} catch {
  prisma = null;
}

export function getPrisma() {
  return prisma;
}
