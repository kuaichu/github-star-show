import { createAsyncRouter } from "../lib/asyncHandler.js";
import { getSessionUser } from "../lib/sessionStore.js";
import {
  fetchRepository,
  fetchRepositoryReadme,
  GITHUB_TOKEN_POLICY,
  parseGithubRepositoryUrl,
  unstarRepository
} from "../services/githubService.js";
import {
  getProjectById,
  listProjects,
  setProjectPublicVisibilityByGithub
} from "../services/projectService.js";
import { upsertProjectForUser } from "../services/projectWriteService.js";
import {
  deleteUserProject,
  getUserProjectByProjectId,
  pickUserEditableProjectFields,
  saveUserProject
} from "../services/userProjectService.js";
import { CATEGORY_SOURCE } from "../services/classificationService.js";
import { PublicHttpError, trySendPublicHttpError } from "../lib/publicHttpError.js";
import { setPrivateNoStore } from "../lib/cacheControl.js";
import { withOperationLeaseTransaction, withSharedProjectCatalogLease } from "../services/operationLeaseService.js";

const router = createAsyncRouter();

function confirmsRepositoryIsNotPublic(error) {
  return error instanceof PublicHttpError &&
    (error.code === "REPOSITORY_NOT_FOUND" || error.code === "REPOSITORY_NOT_PUBLIC");
}

async function attachProjectReadme(project, { accessToken = "" } = {}) {
  if (!project) {
    return project;
  }

  const repoInput = project.github || `${project.author}/${project.name}`;

  try {
    const readme = await fetchRepositoryReadme(repoInput, accessToken, {
      tokenPolicy: GITHUB_TOKEN_POLICY.explicitOnly
    });
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
  setPrivateNoStore(res);
  const user = await getSessionUser(req);

  if (user) {
    const project = await getUserProjectByProjectId(user, req.params.id);

    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    res.json(await attachProjectReadme(project, { accessToken: user.accessToken || "" }));
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
    if (!user) {
      res.status(401).json({ message: "Login required." });
      return;
    }

    await withSharedProjectCatalogLease(async (catalogLease, signal) => {
    const githubInput = req.body?.github;
    const verifiedPublicBefore = new Date();
    let repoData;
    try {
      signal.throwIfAborted();
      repoData = await fetchRepository(githubInput, user.accessToken || "");
    } catch (error) {
      let canonicalGithub = null;
      try {
        const { owner, repo } = parseGithubRepositoryUrl(githubInput);
        canonicalGithub = `https://github.com/${owner}/${repo}`;
      } catch {
        // Invalid input never identifies an existing shared Project.
      }
      if (canonicalGithub && confirmsRepositoryIsNotPublic(error)) await withOperationLeaseTransaction(catalogLease, tx =>
        setProjectPublicVisibilityByGithub(canonicalGithub, false, { client: tx })
      );
      throw error;
    }
    const sharedPayload = {
      name: repoData.repo,
      author: repoData.owner,
      language: repoData.language || "Unknown",
      stars: repoData.stars,
      updatedAt: repoData.updatedAt,
      description: repoData.description,
      github: repoData.github
    };
    const userOverrides = {
      ...pickUserEditableProjectFields(req.body),
      ...(req.body?.category !== undefined
        ? {
            categorySource: CATEGORY_SOURCE.manual,
            categoryReason: "manual:user-selected"
          }
        : {})
    };
    const result = await upsertProjectForUser(user, sharedPayload, userOverrides, {
      updateShared: false,
      verifiedPublic: true,
      verifiedPublicBefore,
      lease: catalogLease
    });
    if (!result) {
      throw new PublicHttpError(
        "PROJECT_VISIBILITY_CONFLICT",
        409,
        "A newer repository visibility check prevented this project update."
      );
    }
    res.status(201).json(result);
    });
  } catch (error) {
    if (!trySendPublicHttpError(res, error)) throw error;
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ message: "Login required." });
      return;
    }

    const project = await getUserProjectByProjectId(user, req.params.id);

    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    const userOverrides = {
      ...pickUserEditableProjectFields(req.body),
      ...(req.body?.category !== undefined
        ? {
            categorySource: CATEGORY_SOURCE.manual,
            categoryReason: "manual:user-selected"
          }
        : {})
    };
    const result = await saveUserProject(user, project, userOverrides);
    res.json(result);
  } catch (error) {
    if (!trySendPublicHttpError(res, error)) throw error;
  }
});

router.delete("/:id", async (req, res) => {
  const requestBody = req.body ?? {};
  if (Object.hasOwn(requestBody, "unstarOnGithub") &&
      typeof requestBody.unstarOnGithub !== "boolean") {
    const error = new PublicHttpError(
      "INVALID_UNSTAR_ON_GITHUB",
      400,
      "unstarOnGithub must be a boolean."
    );
    trySendPublicHttpError(res, error);
    return;
  }

  const user = await getSessionUser(req);

  if (!user) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  const project = await getUserProjectByProjectId(user, req.params.id);

  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  const shouldUnstarOnGithub = requestBody.unstarOnGithub === true;
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
        if (!trySendPublicHttpError(res, error)) throw error;
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
});

export default router;
