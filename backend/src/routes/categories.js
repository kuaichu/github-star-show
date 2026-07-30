import { createAsyncRouter } from "../lib/asyncHandler.js";
import { getSessionUser } from "../lib/sessionStore.js";
import {
  listManagedCategories,
  createManagedCategory,
  renameManagedCategory,
  deleteManagedCategory
} from "../services/categoryService.js";
import { trySendPublicHttpError } from "../lib/publicHttpError.js";
import { setPrivateNoStore } from "../lib/cacheControl.js";

const router = createAsyncRouter();

router.get("/managed", async (req, res) => {
  setPrivateNoStore(res);
  const user = await getSessionUser(req);
  if (!user) {
    res.json({ categories: [] });
    return;
  }

  const categories = await listManagedCategories(user.dbUserId);
  res.json({
    categories: categories.map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt }))
  });
});

router.post("/managed", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Login required." });
    return;
  }

  try {
    const result = await createManagedCategory(user.dbUserId, req.body.name);
    res.status(201).json(result);
  } catch (err) {
    if (!trySendPublicHttpError(res, err)) throw err;
  }
});

router.put("/managed/:name", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Login required." });
    return;
  }

  try {
    const result = await renameManagedCategory(user.dbUserId, req.params.name, req.body.newName);
    res.json(result);
  } catch (err) {
    if (!trySendPublicHttpError(res, err)) throw err;
  }
});

router.delete("/managed/:name", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Login required." });
    return;
  }

  try {
    const result = await deleteManagedCategory(user.dbUserId, req.params.name);
    res.json(result);
  } catch (err) {
    if (!trySendPublicHttpError(res, err)) throw err;
  }
});

export default router;
