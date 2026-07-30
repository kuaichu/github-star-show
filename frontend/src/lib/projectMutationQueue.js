import { reactive, readonly } from "vue";
import { deleteProject, updateProject } from "../api/projects";

const queues = new Map();
const latestTokens = new Map();
const reservations = new Map();
const mutableBusyProjectIds = reactive(new Set());
let mutationGeneration = 0;

export const busyProjectIds = readonly(mutableBusyProjectIds);

function normalizeProjectId(projectId) {
  const normalized = Number(projectId);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError("projectId must be a positive integer");
  }
  return normalized;
}

function invalidatedMutationError() {
  const error = new Error("The authenticated mutation session is no longer valid.");
  error.code = "MUTATION_INVALIDATED";
  return error;
}

function refreshBusyState(id) {
  if (queues.has(id) || (reservations.get(id) || 0) > 0) {
    mutableBusyProjectIds.add(id);
  } else {
    mutableBusyProjectIds.delete(id);
  }
}

export function enqueueProjectMutation(projectId, mutate) {
  const id = normalizeProjectId(projectId);
  if (typeof mutate !== "function") throw new TypeError("mutate must be a function");

  const previousToken = latestTokens.get(id);
  if (previousToken) previousToken.superseded = true;
  const token = { id, generation: mutationGeneration, superseded: false };
  latestTokens.set(id, token);

  const entry = queues.get(id) || { tail: Promise.resolve(), pending: 0 };
  const predecessor = entry.tail;
  entry.pending += 1;
  mutableBusyProjectIds.add(id);

  const task = predecessor
    .catch(() => undefined)
    .then(() => {
      if (token.generation !== mutationGeneration) throw invalidatedMutationError();
      return mutate();
    });
  entry.tail = task.catch(() => undefined);
  queues.set(id, entry);

  const promise = task.finally(() => {
    entry.pending -= 1;
    if (entry.pending === 0 && queues.get(id) === entry) {
      queues.delete(id);
      if (latestTokens.get(id) === token) latestTokens.delete(id);
    }
    refreshBusyState(id);
  });

  return { token, promise };
}

export function queueProjectUpdate(projectId, payload) {
  return enqueueProjectMutation(projectId, () => updateProject(projectId, payload));
}

export function queueProjectDelete(projectId, payload = {}) {
  return enqueueProjectMutation(projectId, () => deleteProject(projectId, payload));
}

export function isProjectMutationBusy(projectId) {
  const id = Number(projectId);
  return Number.isSafeInteger(id) && mutableBusyProjectIds.has(id);
}

export function hasBusyProjectMutations(projectIds) {
  return Array.from(projectIds || []).some(isProjectMutationBusy);
}

export function reserveProjectMutations(projectIds) {
  const ids = [...new Set(Array.from(projectIds || []).map(normalizeProjectId))];
  ids.forEach(id => {
    reservations.set(id, (reservations.get(id) || 0) + 1);
    refreshBusyState(id);
  });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    ids.forEach(id => {
      const remaining = (reservations.get(id) || 0) - 1;
      if (remaining > 0) reservations.set(id, remaining);
      else reservations.delete(id);
      refreshBusyState(id);
    });
  };
}

export function isLatestProjectMutation(projectId, token) {
  return Boolean(token) &&
    token.id === Number(projectId) &&
    token.generation === mutationGeneration &&
    token.superseded === false;
}

export function invalidateProjectMutations() {
  mutationGeneration += 1;
  latestTokens.forEach(token => { token.superseded = true; });
  latestTokens.clear();
}

export function resetProjectMutationQueueForTests() {
  mutationGeneration += 1;
  queues.clear();
  latestTokens.clear();
  reservations.clear();
  mutableBusyProjectIds.clear();
}
