import { Router } from "express";
import { getSessionUser } from "../lib/sessionStore.js";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule
} from "../services/ruleService.js";

const router = Router();

router.get("/", async (req, res) => {
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
    res.status(400).json({ error: err.message });
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
    res.status(400).json({ error: err.message });
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
    res.status(400).json({ error: err.message });
  }
});

export default router;
