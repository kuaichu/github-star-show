import { getPrisma } from "../lib/prisma.js";
import { syncUserStars, SYNC_MODE_FULL, SYNC_MODE_INCREMENTAL } from "./syncService.js";

const TICK_INTERVAL_MS = 60_000;
const running = new Map();
let tickTimer = null;

function mapSchedulerUser(user) {
  return {
    id: String(user.id),
    dbUserId: user.id,
    login: user.githubAccount?.login || "",
    accessToken: user.githubAccount?.accessToken || "",
    lastStarSyncAt: user.lastStarSyncAt || null,
    canManageStars: true
  };
}

export function getSchedulerUser(userId) {
  return running.has(userId) ? "running" : null;
}

export async function getAutoSyncConfig(userId) {
  const prisma = getPrisma();
  if (!prisma) return null;

  let config = await prisma.autoSyncConfig.findUnique({
    where: { userId }
  });

  if (!config) {
    config = await prisma.autoSyncConfig.create({
      data: { userId }
    });
  }

  return config;
}

export async function updateAutoSyncConfig(userId, data) {
  const prisma = getPrisma();
  if (!prisma) return null;

  const updateData = {};

  if (data.enabled !== undefined) {
    updateData.enabled = data.enabled;
  }
  if (data.mode !== undefined) {
    updateData.mode = data.mode;
  }
  if (data.intervalHours !== undefined) {
    updateData.intervalHours = data.intervalHours;
  }

  if (data.enabled) {
    const config = await prisma.autoSyncConfig.findUnique({
      where: { userId }
    });
    const intervalHours = data.intervalHours ?? config?.intervalHours ?? 24;
    updateData.nextScheduledAt = new Date(Date.now() + intervalHours * 3600_000);
  } else {
    updateData.nextScheduledAt = null;
  }

  const config = await prisma.autoSyncConfig.upsert({
    where: { userId },
    create: { userId, ...updateData },
    update: updateData
  });

  return config;
}

async function tick() {
  const prisma = getPrisma();
  if (!prisma) return;

  const now = new Date();

  try {
    const dueConfigs = await prisma.autoSyncConfig.findMany({
      where: {
        enabled: true,
        nextScheduledAt: { lte: now }
      },
      include: {
        user: {
          include: { githubAccount: true }
        }
      }
    });

    for (const config of dueConfigs) {
      const userId = config.userId;

      if (running.has(userId)) continue;
      if (!config.user.githubAccount?.accessToken) continue;

      const schedulerUser = mapSchedulerUser(config.user);
      const mode = config.mode === SYNC_MODE_FULL ? SYNC_MODE_FULL : SYNC_MODE_INCREMENTAL;

      running.set(userId, true);

      (async () => {
        try {
          await syncUserStars(schedulerUser, { mode });
        } catch (err) {
          console.error(`[scheduler] Auto-sync failed for user ${userId}:`, err.message);
        } finally {
          running.delete(userId);

          try {
            const nextRun = new Date(Date.now() + config.intervalHours * 3600_000);
            await prisma.autoSyncConfig.update({
              where: { userId },
              data: { nextScheduledAt: nextRun }
            });
          } catch (err) {
            console.error(`[scheduler] Failed to update nextScheduledAt for user ${userId}:`, err.message);
          }
        }
      })();
    }
  } catch (err) {
    console.error("[scheduler] Tick error:", err.message);
  }
}

export function startScheduler() {
  if (tickTimer) return;
  console.log("[scheduler] Starting auto-sync scheduler (tick every 60s)");
  tick();
  tickTimer = setInterval(tick, TICK_INTERVAL_MS);
}

export function stopScheduler() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
