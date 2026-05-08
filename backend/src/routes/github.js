import { Router } from "express";
import { getSessionUser } from "../lib/sessionStore.js";
import { fetchRepository } from "../services/githubService.js";
import { classifyRepositoryDetailed, CATEGORY_SOURCE } from "../services/classificationService.js";
import { createProject, listProjects, updateProject } from "../services/projectService.js";
import { saveUserProject } from "../services/userProjectService.js";

const router = Router();

router.post("/import-repo", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const repoData = await fetchRepository(req.body.repo);
    const classification = classifyRepositoryDetailed({
      name: repoData.repo,
      description: repoData.description,
      language: repoData.language,
      tags: repoData.tags
    });
    const basePayload = {
      name: repoData.repo,
      author: repoData.owner,
      category: req.body.category || classification.category,
      categorySource: req.body.category ? "manual" : "rule",
      status: req.body.status || "收藏备用",
      language: repoData.language || "Unknown",
      stars: repoData.stars,
      updatedAt: repoData.updatedAt,
      recommended: false,
      description: repoData.description,
      features: req.body.features || [],
      tags: repoData.tags,
      github: repoData.github,
      demo: repoData.homepage,
      docs: req.body.docs || "",
      note: req.body.note || `Imported from GitHub: ${repoData.fullName}`
    };

    const existingProjects = await listProjects({});
    const existing = existingProjects.items.find(item =>
      item.github.toLowerCase() === repoData.github.toLowerCase() ||
      `${item.author}/${item.name}`.toLowerCase() === repoData.fullName.toLowerCase()
    );

    const project = existing
      ? await updateProject(existing.id, {
          ...basePayload,
          category: existing.category,
          categorySource: existing.categorySource || "manual",
          status: existing.status,
          recommended: existing.recommended,
          docs: existing.docs || basePayload.docs,
          demo: existing.demo || basePayload.demo,
          note: existing.note || basePayload.note,
          features: existing.features,
          tags: existing.tags.length ? existing.tags : basePayload.tags
        })
      : await createProject(basePayload);

    const resultProject = user
      ? await saveUserProject(user, project, {
          ...basePayload,
          categorySource: req.body.category ? CATEGORY_SOURCE.manual : classification.categorySource,
          categoryReason: req.body.category ? "manual:user-selected" : classification.categoryReason
        })
      : project;

    res.status(201).json({
      imported: repoData,
      project: resultProject,
      mode: existing ? "updated" : "created"
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to import repository" });
  }
});

export default router;
