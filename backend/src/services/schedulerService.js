import { getPrisma } from "../lib/prisma.js";
import { decryptGithubToken } from "../lib/tokenCrypto.js";
import { PublicHttpError } from "../lib/publicHttpError.js";
import { syncUserStars, SYNC_MODE_FULL, SYNC_MODE_INCREMENTAL } from "./syncService.js";

const TICK_INTERVAL_MS = 60_000;
const running = new Map();
let tickTimer = null;

function mapSchedulerUser(user) {
  return {
    id: String(user.id),
    dbUserId: user.id,
    login: user.githubAccount?.login || "",
    accessToken: decryptGithubToken(user.githubAccount?.accessToken || ""),
    lastStarSyncAt: user.lastStarSyncAt || null,
    canManageStars: true
  };
}

export function getSchedulerUser(userId) {
  return running.has(userId) ? "running" : null;
}

export async function getAutoSyncConfig(userId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");
  userId = Number(userId);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("A positive userId is required");

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
  if (!prisma) throw new Error("Database not available");

  userId = Number(userId);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("A positive userId is required");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new PublicHttpError("INVALID_AUTO_SYNC_CONFIG", 400, "Config input is required");
  }

  const updateData = {};

  if (data.enabled !== undefined) {
    if (typeof data.enabled !== "boolean") {
      throw new PublicHttpError("INVALID_AUTO_SYNC_ENABLED", 400, "enabled must be a boolean");
    }
    updateData.enabled = data.enabled;
  }
  if (data.mode !== undefined) {
    if (![SYNC_MODE_FULL, SYNC_MODE_INCREMENTAL].includes(data.mode)) {
      throw new PublicHttpError("INVALID_AUTO_SYNC_MODE", 400, 'mode must be "full" or "incremental"');
    }
    updateData.mode = data.mode;
  }
  if (data.intervalHours !== undefined) {
    if (!Number.isInteger(data.intervalHours) || data.intervalHours < 1 || data.intervalHours > 720) {
      throw new PublicHttpError(
        "INVALID_AUTO_SYNC_INTERVAL",
        400,
        "intervalHours must be an integer between 1 and 720"
      );
    }
    updateData.intervalHours = data.intervalHours;
  }

  const existing = await prisma.autoSyncConfig.findUnique({ where: { userId } });
  const intervalHours = data.intervalHours ?? existing?.intervalHours ?? 24;
  const enabled = data.enabled ?? existing?.enabled ?? false;

  if (data.enabled === false) {
    updateData.nextScheduledAt = null;
  } else if (data.enabled === true || (data.intervalHours !== undefined && enabled)) {
    updateData.nextScheduledAt = new Date(Date.now() + intervalHours * 3600_000);
  }

  const config = await prisma.autoSyncConfig.upsert({
    where: { userId },
    create: { userId, ...updateData },
    update: updateData
  });

  return config;
}

export async function finalizeScheduledRun(staleConfig) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");
  const current = await prisma.autoSyncConfig.findUnique({
    where: { userId: staleConfig.userId }
  });
  const staleNext = staleConfig.nextScheduledAt?.getTime() ?? null;
  const currentNext = current?.nextScheduledAt?.getTime() ?? null;
  if (!current?.enabled ||
      current.updatedAt.getTime() !== staleConfig.updatedAt.getTime() ||
      currentNext !== staleNext) {
    return false;
  }

  const result = await prisma.autoSyncConfig.updateMany({
    where: {
      id: current.id,
      enabled: true,
      updatedAt: staleConfig.updatedAt,
      nextScheduledAt: staleConfig.nextScheduledAt
    },
    data: {
      nextScheduledAt: new Date(Date.now() + current.intervalHours * 3600_000)
    }
  });
  return result.count === 1;
}

async function tick() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

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
      },
      orderBy: { userId: "asc" }
    });

    for (const config of dueConfigs) {
      const userId = config.userId;

      if (running.has(userId)) continue;
      if (!config.user.githubAccount?.accessToken) continue;

      running.set(userId, true);

      (async () => {
        try {
          const schedulerUser = mapSchedulerUser(config.user);
          const mode = config.mode === SYNC_MODE_FULL ? SYNC_MODE_FULL : SYNC_MODE_INCREMENTAL;
          await syncUserStars(schedulerUser, { mode });
        } catch {
          console.error(`[scheduler] Auto-sync failed for user ${userId}.`);
        } finally {
          running.delete(userId);

          try {
            await finalizeScheduledRun(config);
          } catch {
            console.error(`[scheduler] Failed to update nextScheduledAt for user ${userId}.`);
          }
        }
      })();
    }
  } catch {
    console.error("[scheduler] Tick failed.");
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
