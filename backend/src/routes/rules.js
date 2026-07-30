import { createAsyncRouter } from "../lib/asyncHandler.js";
import { getSessionUser } from "../lib/sessionStore.js";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule
} from "../services/ruleService.js";
import { setPrivateNoStore } from "../lib/cacheControl.js";
import { trySendPublicHttpError } from "../lib/publicHttpError.js";

const router = createAsyncRouter();

router.get("/", async (req, res) => {
  setPrivateNoStore(res);
  const user = await getSessionUser(req);
  if (!user) {
    res.json({ rules: [] });
    return;
  }

  const rules = listRules(user.dbUserId || user.id);
  res.json({ rules });
});

router.post("/", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Login required." });
    return;
  }

  try {
    const rule = createRule(user.dbUserId || user.id, req.body);
    res.status(201).json(rule);
  } catch (err) {
    if (!trySendPublicHttpError(res, err)) throw err;
  }
});

router.put("/:id", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Login required." });
    return;
  }

  try {
    const rule = updateRule(user.dbUserId || user.id, req.params.id, req.body);
    res.json(rule);
  } catch (err) {
    if (!trySendPublicHttpError(res, err)) throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Login required." });
    return;
  }

  try {
    deleteRule(user.dbUserId || user.id, req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    if (!trySendPublicHttpError(res, err)) throw err;
  }
});

export default router;
