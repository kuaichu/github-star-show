import "dotenv/config";
import cors from "cors";
import express from "express";
import authRouter from "./routes/auth.js";
import categoriesRouter from "./routes/categories.js";
import githubRouter from "./routes/github.js";
import projectsRouter from "./routes/projects.js";
import rulesRouter from "./routes/rules.js";
import syncRouter from "./routes/sync.js";
import { getSessionUser } from "./lib/sessionStore.js";
import { verifyCsrf } from "./lib/csrfProtection.js";
import { assertTokenEncryptionConfigured } from "./lib/tokenCrypto.js";
import { getMeta } from "./services/projectService.js";
import { getAllCategories } from "./services/categoryService.js";
import { probeDatabase } from "./lib/prisma.js";
import { asyncHandler } from "./lib/asyncHandler.js";
import { validateRuntimeConfig } from "./lib/runtimeConfig.js";
import { setPrivateNoStore } from "./lib/cacheControl.js";

assertTokenEncryptionConfigured();
const runtimeConfig = validateRuntimeConfig();

const app = express();
app.set("trust proxy", runtimeConfig.trustProxy);

app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || runtimeConfig.clientOrigin === origin);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"]
  })
);
app.use(express.json({ limit: "100kb", strict: false }));
app.use(asyncHandler(verifyCsrf));

app.get("/api/health", asyncHandler(async (_req, res) => {
  try {
    await probeDatabase();
    res.json({
      ok: true,
      service: "github-star-show-backend",
      database: "available"
    });
  } catch {
    res.status(503).json({
      ok: false,
      service: "github-star-show-backend",
      database: "unavailable"
    });
  }
}));

app.get("/api/meta", asyncHandler(async (req, res) => {
  setPrivateNoStore(res);
  const meta = await getMeta();
  const user = await getSessionUser(req);
  const allCategories = await getAllCategories(user?.dbUserId);
  const merged = [...new Set([...allCategories, ...meta.categories.filter(c => c !== "全部项目")])];
  res.json({
    ...meta,
    categories: ["全部项目", ...merged]
  });
}));

app.use("/auth", authRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/github", githubRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/rules", rulesRouter);
app.use("/api/sync", syncRouter);

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Internal server error." });
});

export default app;
