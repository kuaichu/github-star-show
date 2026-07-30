import { getPrisma } from "../lib/prisma.js";
import { upsertProjectByGithub } from "./projectService.js";
import { saveUserProject, saveUserProjectIfUnchanged } from "./userProjectService.js";
import { assertOperationLease } from "./operationLeaseService.js";

export async function upsertProjectForUser(user, sharedPayload, userOverrides = {}, options = {}) {
  const prisma = getPrisma();
  const updateShared = Boolean(options.updateShared);

  if (!prisma) {
    throw new Error("Database not available for transactional project writes");
  }

  return prisma.$transaction(async tx => {
    if (options.lease) await assertOperationLease(tx, options.lease);
    const project = await upsertProjectByGithub(sharedPayload, {
      client: tx,
      updateExisting: updateShared,
      verifiedPublic: Boolean(options.verifiedPublic),
      verifiedPublicBefore: options.verifiedPublicBefore
    });
    if (!project) return null;
    const saveOverlay = options.existingUserProject
      ? saveUserProjectIfUnchanged
      : saveUserProject;
    return saveOverlay(user, project, userOverrides, {
      client: tx,
      createOnlyFields: options.userCreateOnlyFields,
      expectedProject: options.existingUserProject
    });
  });
}
