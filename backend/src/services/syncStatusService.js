import { getPrisma } from "../lib/prisma.js";
import { leaseTtlSeconds } from "./operationLeaseService.js";

function staleRunSeconds() {
  const configured = Number(process.env.SYNC_RUN_STALE_SECONDS);
  if (Number.isInteger(configured) && configured >= 60 && configured <= 86_400) {
    return configured;
  }
  return Math.max(leaseTtlSeconds("sync") * 2, 15 * 60);
}

async function reconcileStaleRuns(prisma, userId) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - staleRunSeconds() * 1000);
  const activeLease = await prisma.operationLease.findFirst({
    where: {
      key: `sync:${userId}`,
      userId,
      kind: "sync",
      owner: { not: "" },
      expiresAt: { gt: now }
    },
    select: { key: true }
  });

  let protectedRunId = null;
  if (activeLease) {
    protectedRunId = (await prisma.syncRun.findFirst({
      where: { userId, status: "running" },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: { id: true }
    }))?.id || null;
  }

  await prisma.syncRun.updateMany({
    where: {
      userId,
      status: "running",
      startedAt: { lte: cutoff },
      ...(protectedRunId ? { id: { not: protectedRunId } } : {})
    },
    data: {
      status: "failed",
      errorCode: "SYNC_RUN_STALE",
      errorSummary: "Sync run became stale after its operation lease ended.",
      completedAt: now
    }
  });
}

export async function getSyncStatusForUser(user) {
  const prisma = getPrisma();

  if (!prisma) throw new Error("Database not available");

  const userId = user.dbUserId || Number(user.id);
  await reconcileStaleRuns(prisma, userId);
  const [userRecord, recentRuns] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastStarSyncAt: true
      }
    }),
    prisma.syncRun.findMany({
      where: { userId },
      orderBy: {
        createdAt: "desc"
      },
      take: 5
    })
  ]);

  return {
    lastStarSyncAt: userRecord?.lastStarSyncAt || null,
    recentRuns: recentRuns.map(run => ({
      id: run.id,
      source: run.source,
      mode: run.source === "github_star_incremental" ? "incremental" : "full",
      status: run.status,
      total: run.total,
      skippedPrivate: run.skippedPrivate,
      errorCode: run.errorCode,
      errorSummary: run.errorSummary,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdAt: run.createdAt
    }))
  };
}
