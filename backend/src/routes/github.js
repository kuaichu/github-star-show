import { createAsyncRouter } from "../lib/asyncHandler.js";
import { getSessionUser } from "../lib/sessionStore.js";
import { fetchRepository, isPublicGithubRepository, parseGithubRepositoryUrl } from "../services/githubService.js";
import { classifyRepositoryDetailed, CATEGORY_SOURCE } from "../services/classificationService.js";
import { upsertProjectForUser } from "../services/projectWriteService.js";
import { pickUserEditableProjectFields } from "../services/userProjectService.js";
import { trySendPublicHttpError } from "../lib/publicHttpError.js";
import { PublicHttpError } from "../lib/publicHttpError.js";
import { setProjectPublicVisibilityByGithub } from "../services/projectService.js";
import { withOperationLeaseTransaction, withSharedProjectCatalogLease } from "../services/operationLeaseService.js";

const router = createAsyncRouter();

function confirmsRepositoryIsNotPublic(error) {
  return error instanceof PublicHttpError &&
    (error.code === "REPOSITORY_NOT_FOUND" || error.code === "REPOSITORY_NOT_PUBLIC");
}

router.post("/import-repo", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ message: "Login required." });
      return;
    }

    await withSharedProjectCatalogLease(async (catalogLease, signal) => {
    const requestBody = req.body || {};
    const verifiedPublicBefore = new Date();
    let repoData;
    try {
      signal.throwIfAborted();
      repoData = await fetchRepository(requestBody.repo, user.accessToken);
    } catch (error) {
      let canonicalGithub = null;
      try {
        const { owner, repo } = parseGithubRepositoryUrl(requestBody.repo);
        canonicalGithub = `https://github.com/${owner}/${repo}`;
      } catch {
        // Invalid input never identifies an existing shared Project.
      }
      if (canonicalGithub && confirmsRepositoryIsNotPublic(error)) await withOperationLeaseTransaction(catalogLease, tx =>
        setProjectPublicVisibilityByGithub(canonicalGithub, false, { client: tx })
      );
      throw error;
    }
    if (!isPublicGithubRepository(repoData)) {
      res.status(400).json({ message: "Only public GitHub repositories can be imported." });
      return;
    }
    const classification = classifyRepositoryDetailed({
      name: repoData.repo,
      description: repoData.description,
      language: repoData.language,
      tags: repoData.tags
    });
    const sharedPayload = {
      name: repoData.repo,
      author: repoData.owner,
      language: repoData.language || "Unknown",
      stars: repoData.stars,
      updatedAt: repoData.updatedAt,
      description: repoData.description,
      github: repoData.github
    };
    const explicitlySubmitted = Object.fromEntries(
      ["category", "status", "note", "features", "docs"]
        .filter(field => Object.hasOwn(requestBody, field))
        .map(field => [field, requestBody[field]])
    );
    const explicitUpdates = pickUserEditableProjectFields(explicitlySubmitted);
    if (Object.hasOwn(explicitUpdates, "category")) {
      explicitUpdates.categorySource = CATEGORY_SOURCE.manual;
      explicitUpdates.categoryReason = "manual:user-selected";
    }
    const createDefaults = {
      category: classification.category,
      categorySource: classification.categorySource,
      categoryReason: classification.categoryReason,
      status: "收藏备用",
      recommended: false,
      features: [],
      tags: repoData.tags,
      demo: repoData.homepage,
      docs: "",
      note: `Imported from GitHub: ${repoData.fullName}`
    };
    const userOverrides = { ...createDefaults, ...explicitUpdates };
    const userCreateOnlyFields = Object.keys(createDefaults)
      .filter(field => !Object.hasOwn(explicitUpdates, field));

    const resultProject = await upsertProjectForUser(user, sharedPayload, userOverrides, {
      updateShared: true,
      verifiedPublic: true,
      verifiedPublicBefore,
      userCreateOnlyFields,
      lease: catalogLease
    });
    if (!resultProject) {
      throw new PublicHttpError(
        "PROJECT_VISIBILITY_CONFLICT",
        409,
        "A newer repository visibility check prevented this project update."
      );
    }

    res.status(201).json({
      imported: repoData,
      project: resultProject,
      mode: "upserted"
    });
    });
  } catch (error) {
    if (!trySendPublicHttpError(res, error)) throw error;
  }
});

export default router;
