import crypto from "node:crypto";
import { getPrisma } from "../lib/prisma.js";
import { PublicHttpError } from "../lib/publicHttpError.js";

export class OperationLeaseError extends PublicHttpError {
  constructor(message, { code, statusCode, retryAfterSeconds = 1 } = {}) {
    const resolvedCode = code || "LEASE_CONFLICT";
    const resolvedStatusCode = statusCode || 409;
    super(resolvedCode, resolvedStatusCode, message);
    this.name = "OperationLeaseError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export class OperationLeaseLostError extends OperationLeaseError {
  constructor() {
    super("Operation lease ownership was lost.", {
      code: "LEASE_LOST",
      statusCode: 409,
      retryAfterSeconds: 1
    });
    this.name = "OperationLeaseLostError";
  }
}

function positiveInteger(value, fallback, { min = 1, max = 3600 } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function leaseTtlSeconds(kind) {
  if (kind === "ai") {
    return positiveInteger(process.env.AI_LEASE_TTL_SECONDS, 600);
  }
  return positiveInteger(process.env.SYNC_LEASE_TTL_SECONDS, 300);
}

export async function claimOperationLease({ key, userId, kind, ttlSeconds, respectCooldown = false }) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

  userId = Number(userId);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("A positive userId is required");
  if (!key || !kind) throw new Error("Lease key and kind are required");

  const now = new Date();
  const ttl = positiveInteger(ttlSeconds, leaseTtlSeconds(kind));
  const expiresAt = new Date(now.getTime() + ttl * 1000);
  const owner = crypto.randomUUID();
  const claimed = await prisma.$queryRaw`
    INSERT INTO "OperationLease" (
      "key", "userId", "kind", "owner", "generation", "expiresAt", "cooldownUntil", "updatedAt"
    ) VALUES (${key}, ${userId}, ${kind}, ${owner}, 1, ${expiresAt}, NULL, ${now})
    ON CONFLICT("key") DO UPDATE SET
      "userId" = excluded."userId",
      "kind" = excluded."kind",
      "owner" = excluded."owner",
      "generation" = "OperationLease"."generation" + 1,
      "expiresAt" = excluded."expiresAt",
      "updatedAt" = excluded."updatedAt"
    WHERE (
      "OperationLease"."owner" = '' OR
      "OperationLease"."expiresAt" IS NULL OR
      "OperationLease"."expiresAt" <= ${now}
    ) AND (
      ${respectCooldown ? 1 : 0} = 0 OR
      "OperationLease"."cooldownUntil" IS NULL OR
      "OperationLease"."cooldownUntil" <= ${now}
    )
    RETURNING "generation"
  `;

  if (claimed.length === 1) {
    return {
      key,
      userId,
      kind,
      owner,
      generation: Number(claimed[0].generation),
      expiresAt,
      ttlSeconds: ttl
    };
  }

  const current = await prisma.operationLease.findUnique({ where: { key } });
  if (respectCooldown && current?.cooldownUntil && current.cooldownUntil > now) {
    throw new OperationLeaseError("Operation is cooling down.", {
      code: "LEASE_COOLDOWN",
      statusCode: 429,
      retryAfterSeconds: (current.cooldownUntil.getTime() - now.getTime()) / 1000
    });
  }

  throw new OperationLeaseError("Operation is already running.", {
    code: "LEASE_CONFLICT",
    statusCode: 409,
    retryAfterSeconds: current?.expiresAt
      ? (current.expiresAt.getTime() - now.getTime()) / 1000
      : 1
  });
}

export async function renewOperationLease(lease) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lease.ttlSeconds * 1000);
  const result = await prisma.operationLease.updateMany({
    where: {
      key: lease.key,
      owner: lease.owner,
      generation: lease.generation,
      expiresAt: { gt: now }
    },
    data: { expiresAt }
  });
  if (result.count === 1) lease.expiresAt = expiresAt;
  return result.count === 1;
}

export async function releaseOperationLease(lease, { cooldownSeconds = 0 } = {}) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");
  const cooldown = positiveInteger(cooldownSeconds, 0, { min: 1, max: 86_400 });
  const data = {
    owner: "",
    expiresAt: null
  };
  if (cooldown > 0) {
    data.cooldownUntil = new Date(Date.now() + cooldown * 1000);
  }
  const result = await prisma.operationLease.updateMany({
    where: { key: lease.key, owner: lease.owner, generation: lease.generation },
    data
  });
  return result.count === 1;
}

export async function assertOperationLease(tx, lease, now = new Date()) {
  if (!tx || !lease) throw new OperationLeaseLostError();
  const current = await tx.operationLease.findFirst({
    where: {
      key: lease.key,
      owner: lease.owner,
      generation: lease.generation,
      expiresAt: { gt: now }
    },
    select: { key: true }
  });
  if (!current) throw new OperationLeaseLostError();
}

export async function withOperationLeaseTransaction(lease, work) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");
  return prisma.$transaction(async tx => {
    await assertOperationLease(tx, lease);
    return work(tx);
  });
}

export async function withOperationLease(options, work) {
  const lease = await claimOperationLease(options);
  let succeeded = false;
  const controller = new AbortController();
  const heartbeatMs = Math.max(100, Math.floor(lease.ttlSeconds * 1000 / 3));
  let renewalPromise = null;
  const loseLease = () => {
    if (!controller.signal.aborted) controller.abort(new OperationLeaseLostError());
  };
  const heartbeat = setInterval(async () => {
    if (renewalPromise || controller.signal.aborted) return;
    renewalPromise = (async () => {
      try {
        if (!await renewOperationLease(lease)) loseLease();
      } catch {
        loseLease();
      } finally {
        renewalPromise = null;
      }
    })();
    await renewalPromise;
  }, heartbeatMs);
  heartbeat.unref?.();

  try {
    const result = await work(lease, controller.signal);
    clearInterval(heartbeat);
    if (renewalPromise) await renewalPromise;
    if (controller.signal.aborted) throw controller.signal.reason;
    succeeded = true;
    return result;
  } finally {
    clearInterval(heartbeat);
    if (renewalPromise) await renewalPromise;
    try {
      const released = await releaseOperationLease(lease, {
        cooldownSeconds: succeeded ? options.cooldownSeconds : 0
      });
      if (!released) {
        console.error(`[lease] Failed to release ${lease.key} generation ${lease.generation}: ownership changed.`);
      }
    } catch {
      console.error(`[lease] Failed to release ${lease.key} generation ${lease.generation}.`);
    }
  }
}

export const SHARED_PROJECT_CATALOG_LEASE = Object.freeze({
  key: "shared-project-catalog",
  userId: 1,
  kind: "shared-project-catalog"
});

export async function withSharedProjectCatalogLease(work) {
  // Catalog mutations are expected to serialize, not surface a per-user 409.
  // Keep the retry local to this single global lease so existing user-scoped
  // lease admission semantics remain unchanged.
  const deadline = Date.now() + 1000;
  while (true) {
    try {
      return await withOperationLease(SHARED_PROJECT_CATALOG_LEASE, work);
    } catch (error) {
      if (!(error instanceof OperationLeaseError) || error.code !== "LEASE_CONFLICT" || Date.now() >= deadline) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
}
