import { Router } from "express";
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

const router = Router();

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
    res.status(400).json({ message: error.message || "Unable to sync GitHub stars." });
  }
});

router.get("/me/projects", async (req, res) => {
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
    res.status(400).json({ message: error.message || "Unable to re-run rule classification." });
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
    res.status(400).json({ message: error.message || "Unable to recheck remote status." });
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
    const items = await getProjectsForUser(user);
    const result = await classifyProjectsWithAi(items, {
      force: Boolean(req.body?.force),
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
    res.status(400).json({ message: error.message || "Unable to run AI classification." });
  }
});

export default router;
