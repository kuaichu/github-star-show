import { Router } from "express";
import { getSessionUser } from "../lib/sessionStore.js";
import { fetchRepositoryReadme, unstarRepository } from "../services/githubService.js";
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProject
} from "../services/projectService.js";
import {
  deleteUserProject,
  getUserProjectByProjectId,
  saveUserProject
} from "../services/userProjectService.js";

const router = Router();

async function attachProjectReadme(project, accessToken = "") {
  if (!project) {
    return project;
  }

  const repoInput = project.github || `${project.author}/${project.name}`;

  try {
    const readme = await fetchRepositoryReadme(repoInput, accessToken);
    return {
      ...project,
      readme
    };
  } catch {
    return {
      ...project,
      readme: ""
    };
  }
}

router.get("/", async (req, res) => {
  const data = await listProjects(req.query);
  res.json(data);
});

router.get("/:id", async (req, res) => {
  const user = await getSessionUser(req);

  if (user) {
    const project = await getUserProjectByProjectId(user, req.params.id);

    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    res.json(await attachProjectReadme(project, user.accessToken || ""));
    return;
  }

  const project = await getProjectById(req.params.id);

  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  res.json(await attachProjectReadme(project));
});

router.post("/", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const project = await createProject(req.body);
    const result = user ? await saveUserProject(user, project, req.body) : project;
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to create project" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const project = await updateProject(req.params.id, req.body);

    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    const result = user ? await saveUserProject(user, project, req.body) : project;
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to update project" });
  }
});

router.delete("/:id", async (req, res) => {
  const user = await getSessionUser(req);

  if (user) {
    const project = await getUserProjectByProjectId(user, req.params.id);

    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    const shouldUnstarOnGithub = Boolean(req.body?.unstarOnGithub);
    const githubUnstar = {
      attempted: shouldUnstarOnGithub,
      success: false,
      message: ""
    };

    if (shouldUnstarOnGithub) {
      if (!user.canManageStars) {
        res.status(400).json({
          message: "GitHub authorization does not include star management yet. Please log out and log in again to grant the new permission."
        });
        return;
      } else {
        try {
          await unstarRepository(user.accessToken, project.github || `${project.author}/${project.name}`);
          githubUnstar.success = true;
          githubUnstar.message = "GitHub star removed.";
        } catch (error) {
          res.status(400).json({
            message: error.message || "GitHub unstar failed."
          });
          return;
        }
      }
    }

    const success = await deleteUserProject(user, req.params.id);

    if (!success) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    res.json({
      removed: true,
      project: {
        id: project.id,
        name: project.name,
        github: project.github
      },
      githubUnstar
    });
    return;
  }

  const success = await deleteProject(req.params.id);

  if (!success) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  res.status(204).send();
});

export default router;
