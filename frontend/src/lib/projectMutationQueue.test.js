import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueProjectMutation,
  hasBusyProjectMutations,
  invalidateProjectMutations,
  isLatestProjectMutation,
  isProjectMutationBusy,
  reserveProjectMutations,
  resetProjectMutationQueueForTests
} from "./projectMutationQueue";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("project mutation queue", () => {
  beforeEach(() => resetProjectMutationQueueForTests());

  it("serializes update and delete for one project and cleans up after settlement", async () => {
    const first = deferred();
    const calls = [];
    const queuedFirst = enqueueProjectMutation(7, async () => {
      calls.push("update:start");
      await first.promise;
      calls.push("update:end");
      return "updated";
    });
    const queuedSecond = enqueueProjectMutation(7, async () => {
      calls.push("delete");
      return "deleted";
    });

    await vi.waitFor(() => expect(calls).toEqual(["update:start"]));
    expect(isProjectMutationBusy(7)).toBe(true);
    expect(hasBusyProjectMutations([7, 8])).toBe(true);

    first.resolve();
    await expect(queuedFirst.promise).resolves.toBe("updated");
    await expect(queuedSecond.promise).resolves.toBe("deleted");
    expect(calls).toEqual(["update:start", "update:end", "delete"]);
    expect(isProjectMutationBusy(7)).toBe(false);
  });

  it("allows different projects to run concurrently", async () => {
    const a = deferred();
    const b = deferred();
    const started = [];
    const queuedA = enqueueProjectMutation(1, async () => { started.push(1); return a.promise; });
    const queuedB = enqueueProjectMutation(2, async () => { started.push(2); return b.promise; });

    await vi.waitFor(() => expect([...started].sort()).toEqual([1, 2]));
    a.resolve("a");
    b.resolve("b");
    await Promise.all([queuedA.promise, queuedB.promise]);
  });

  it("continues after rejection and marks superseded responses stale", async () => {
    const first = deferred();
    const secondMutation = vi.fn(async () => "new value");
    const queuedFirst = enqueueProjectMutation(3, () => first.promise);
    const queuedSecond = enqueueProjectMutation(3, secondMutation);

    expect(isLatestProjectMutation(3, queuedFirst.token)).toBe(false);
    expect(isLatestProjectMutation(3, queuedSecond.token)).toBe(true);
    first.reject(new Error("old failed"));
    await expect(queuedFirst.promise).rejects.toThrow("old failed");
    await expect(queuedSecond.promise).resolves.toBe("new value");
    expect(secondMutation).toHaveBeenCalledOnce();
  });

  it("does not dispatch queued work from an invalidated auth generation", async () => {
    const first = deferred();
    const firstMutation = vi.fn(() => first.promise);
    const queuedFirst = enqueueProjectMutation(4, firstMutation);
    await vi.waitFor(() => expect(firstMutation).toHaveBeenCalledOnce());
    const staleMutation = vi.fn(async () => "must not run");
    const queuedStale = enqueueProjectMutation(4, staleMutation);
    const staleExpectation = expect(queuedStale.promise).rejects.toMatchObject({ code: "MUTATION_INVALIDATED" });
    invalidateProjectMutations();
    first.resolve("done");

    await expect(queuedFirst.promise).resolves.toBe("done");
    await staleExpectation;
    expect(staleMutation).not.toHaveBeenCalled();
    expect(isProjectMutationBusy(4)).toBe(false);
  });

  it("continues the same-project queue after a request timeout", async () => {
    const timeout = Object.assign(new Error("timed out"), { code: "REQUEST_TIMEOUT" });
    const nextMutation = vi.fn().mockResolvedValue("next completed");
    const timedOut = enqueueProjectMutation(12, () => Promise.reject(timeout));
    const next = enqueueProjectMutation(12, nextMutation);

    await expect(timedOut.promise).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await expect(next.promise).resolves.toBe("next completed");
    expect(nextMutation).toHaveBeenCalledTimes(1);
    expect(isProjectMutationBusy(12)).toBe(false);
  });

  it("reserves every batch target before its worker dispatches and releases without leaks", () => {
    const release = reserveProjectMutations([8, 9, 9]);
    expect(isProjectMutationBusy(8)).toBe(true);
    expect(isProjectMutationBusy(9)).toBe(true);
    release();
    release();
    expect(isProjectMutationBusy(8)).toBe(false);
    expect(isProjectMutationBusy(9)).toBe(false);
  });
});
