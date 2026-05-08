import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import authRouter from "./routes/auth.js";
import githubRouter from "./routes/github.js";
import projectsRouter from "./routes/projects.js";
import syncRouter from "./routes/sync.js";
import { getMeta } from "./services/projectService.js";

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

app.get("/api/meta", async (_req, res) => {
  res.json(await getMeta());
});

app.use("/auth", authRouter);
app.use("/api/github", githubRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/sync", syncRouter);

export default app;
