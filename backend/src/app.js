import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import authRouter from "./routes/auth.js";
import categoriesRouter from "./routes/categories.js";
import githubRouter from "./routes/github.js";
import projectsRouter from "./routes/projects.js";
import rulesRouter from "./routes/rules.js";
import syncRouter from "./routes/sync.js";
import { getSessionUser } from "./lib/sessionStore.js";
import { getMeta } from "./services/projectService.js";
import { getAllCategories } from "./services/categoryService.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "github-star-show-backend"
  });
});

app.get("/api/meta", async (req, res) => {
  const meta = await getMeta();
  const user = await getSessionUser(req);
  const allCategories = await getAllCategories(user?.dbUserId);
  const merged = [...new Set([...allCategories, ...meta.categories.filter(c => c !== "全部项目")])];
  res.json({
    ...meta,
    categories: ["全部项目", ...merged]
  });
});

app.use("/auth", authRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/github", githubRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/rules", rulesRouter);
app.use("/api/sync", syncRouter);

export default app;
