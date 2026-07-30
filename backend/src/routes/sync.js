import { createAsyncRouter } from "../lib/asyncHandler.js";
import { getSessionUser } from "../lib/sessionStore.js";
import {
  getProjectsForUser,
  recheckRemoteStatusForUser,
  rerunRuleClassificationForUser,
  SYNC_MODE_FULL,
  SYNC_MODE_INCREMENTAL,
  syncUserStars
} from "../services/syncService.js";
import { classifyProjectsWithAi, getAiClassificationConfig } from "../services/aiClassificationService.js";
import { getSyncStatusForUser } from "../services/syncStatusService.js";
import { getAutoSyncConfig, updateAutoSyncConfig } from "../services/schedulerService.js";
import { NetworkRequestError } from "../lib/httpClient.js";
import { PublicHttpError } from "../lib/publicHttpError.js";
import { setPrivateNoStore } from "../lib/cacheControl.js";

const router = createAsyncRouter();

function safeRetryAfterSeconds(error) {
  return Number.isSafeInteger(error?.retryAfterSeconds) && error.retryAfterSeconds >= 0
    ? error.retryAfterSeconds
    : null;
}

function sendOperationError(res, error, extra = {}) {
  if (error instanceof PublicHttpError && error.expose === true) {
    const retryAfterSeconds = safeRetryAfterSeconds(error);
    if (retryAfterSeconds !== null) res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(error.statusCode).json({
      ...extra,
      code: error.code,
      message: error.publicMessage
    });
    return true;
  }

  if (error instanceof NetworkRequestError) {
    const retryAfterSeconds = safeRetryAfterSeconds(error);
    if (error.rateLimited && retryAfterSeconds !== null) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
    }
    const messages = {
      RATE_LIMITED: "Upstream rate limit reached.",
      REQUEST_TIMEOUT: "An upstream request timed out.",
      NETWORK_ERROR: "Unable to reach the upstream service.",
      RESPONSE_TOO_LARGE: "The upstream response was too large.",
      HTTP_ERROR: "The upstream service returned an unsuccessful response."
    };
    res.status(error.rateLimited ? 429 : 400).json({
      ...extra,
      code: error.code,
      message: messages[error.code] || "The upstream request failed."
    });
    return true;
  }

  return false;
}

router.post("/github-stars", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  try {
    const requestedMode = req.body?.mode === SYNC_MODE_INCREMENTAL ? SYNC_MODE_INCREMENTAL : SYNC_MODE_FULL;
    const result = await syncUserStars(user, {
      mode: requestedMode
    });
    res.json(result);
  } catch (error) {
    if (!sendOperationError(res, error, { status: "failed" })) throw error;
  }
});

router.get("/me/projects", async (req, res) => {
  setPrivateNoStore(res);
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  res.json({
    items: await getProjectsForUser(user)
  });
});

router.get("/me/status", async (req, res) => {
  setPrivateNoStore(res);
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  res.json(await getSyncStatusForUser(user));
});

router.post("/reclassify-rules", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  try {
    res.json(await rerunRuleClassificationForUser(user));
  } catch (error) {
    if (!sendOperationError(res, error)) throw error;
  }
});

router.post("/recheck-remote-status", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  try {
    res.json(await recheckRemoteStatusForUser(user, req.body?.projectIds || []));
  } catch (error) {
    if (!sendOperationError(res, error)) throw error;
  }
});

router.get("/ai-config", (_req, res) => {
  res.json(getAiClassificationConfig());
});

router.post("/ai-classify", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  try {
    const force = req.body?.force ?? false;
    if (typeof force !== "boolean") {
      throw new PublicHttpError("INVALID_AI_FORCE", 400, "force must be a boolean");
    }
    const items = await getProjectsForUser(user);
    const result = await classifyProjectsWithAi(items, {
      user,
      force,
      limit: req.body?.limit
    });

    if (!result.enabled) {
      res.status(400).json({
        message: "AI classification is not configured. Set OPENAI_API_KEY and enable AI_CLASSIFICATION_ENABLED."
      });
      return;
    }

    res.json(result);
  } catch (error) {
    if (!sendOperationError(res, error)) throw error;
  }
});

router.get("/auto-config", async (req, res) => {
  setPrivateNoStore(res);
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  try {
    const config = await getAutoSyncConfig(user.dbUserId);
    res.json(config);
  } catch (error) {
    if (!sendOperationError(res, error)) throw error;
  }
});

router.put("/auto-config", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  try {
    const config = await updateAutoSyncConfig(user.dbUserId, req.body);
    res.json(config);
  } catch (error) {
    if (!sendOperationError(res, error)) throw error;
  }
});

export default router;
