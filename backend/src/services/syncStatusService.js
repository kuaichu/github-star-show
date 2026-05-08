import { getPrisma } from "../lib/prisma.js";

export async function getSyncStatusForUser(user) {
  const prisma = getPrisma();

  if (!prisma) {
    return {
      lastStarSyncAt: null,
      recentRuns: []
    };
  }

  const userId = user.dbUserId || Number(user.id);
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
      total: run.total,
      createdAt: run.createdAt
    }))
  };
}
