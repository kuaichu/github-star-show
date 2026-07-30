import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let testAdapter;

export function getPrisma() {
  return testAdapter === undefined ? prisma : testAdapter;
}

export function setPrismaAdapterForTests(adapter) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Prisma adapter injection is available only in tests");
  }
  testAdapter = adapter;
}

export function resetPrismaAdapterForTests() {
  testAdapter = undefined;
}

export async function probeDatabase() {
  const client = getPrisma();
  if (!client) throw new Error("Database not available");
  await client.$queryRawUnsafe("SELECT 1");
  return true;
}
