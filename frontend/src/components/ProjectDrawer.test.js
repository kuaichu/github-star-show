import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ updateProject: vi.fn() }));

vi.mock("../api/projects", () => api);

import ProjectDrawer from "./ProjectDrawer.vue";
import { reserveProjectMutations, resetProjectMutationQueueForTests } from "../lib/projectMutationQueue";

beforeEach(() => resetProjectMutationQueueForTests());

function project(overrides = {}) {
  return {
    id: 1,
    name: "Safe drawer",
    author: "owner",
    category: "收藏",
    status: "收藏备用",
    language: "JavaScript",
    stars: 1,
    updatedAt: "2026-07-26",
    recommended: false,
    description: "",
    github: "https://github.com/owner/repo",
    demo: "",
    docs: "",
    note: "",
    features: [],
    tags: [],
    remoteStatus: "active",
    readme: "# README",
    ...overrides
  };
}

function mountDrawer(value) {
  return mount(ProjectDrawer, {
    props: {
      visible: true,
      project: value,
      categories: [],
      formatDate: input => String(input),
      formatNumber: input => String(input)
    }
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("ProjectDrawer external links", () => {
  it("does not render legacy dangerous github, demo, docs, release, or README links", async () => {
    const wrapper = mountDrawer(project({
      github: "javascript:alert(1)",
      demo: "data:text/html,unsafe",
      docs: "file:///tmp/unsafe",
      latestReleaseAt: "2026-07-26"
    }));

    expect(wrapper.findAll("a")).toHaveLength(0);
    await wrapper.findAll(".drawer-tab")[1].trigger("click");
    expect(wrapper.findAll("a")).toHaveLength(0);
    wrapper.unmount();
  });

  it("renders valid http and https github, release, demo, docs, and README links", async () => {
    const wrapper = mountDrawer(project({
      github: "https://github.com/owner/repo",
      demo: "http://demo.example.test/path",
      docs: "https://docs.example.test/path",
      latestReleaseAt: "2026-07-26"
    }));

    expect(wrapper.findAll(".drawer-top-actions a").map(link => link.attributes("href"))).toEqual([
      "https://github.com/owner/repo",
      "https://github.com/owner/repo/releases",
      "http://demo.example.test/path",
      "https://docs.example.test/path"
    ]);
    await wrapper.findAll(".drawer-tab")[1].trigger("click");
    expect(wrapper.get(".detail-panel-head a").attributes("href")).toBe("https://github.com/owner/repo#readme");
    wrapper.unmount();
  });

  it("renders unsafe README markdown links and images as non-clickable text", async () => {
    const wrapper = mountDrawer(project({
      readme: [
        "[userinfo](https://user:password@example.test/path)",
        "[control](https://example.test/%00x)",
        "[malformed](https://[invalid)",
        "![tracking pixel](https://user:password@example.test/pixel.png)",
        "[valid](https://github.com/owner/repo)"
      ].join("\n\n")
    }));

    await wrapper.findAll(".drawer-tab")[1].trigger("click");
    const readme = wrapper.get(".markdown-body");
    expect(readme.findAll("a").map(link => link.attributes("href")))
      .toEqual(["https://github.com/owner/repo"]);
    expect(readme.findAll("img")).toHaveLength(0);
    expect(readme.text()).toContain("userinfo");
    expect(readme.text()).toContain("tracking pixel");
    wrapper.unmount();
  });

  it("renders README links and images with uppercase HTTP and HTTPS schemes", async () => {
    const wrapper = mountDrawer(project({
      readme: [
        "[upper link](HTTPS://example.test/docs)",
        "![upper image](HTTP://example.test/image.png)"
      ].join("\n\n")
    }));

    await wrapper.findAll(".drawer-tab")[1].trigger("click");
    const readme = wrapper.get(".markdown-body");
    expect(readme.get("a").attributes("href")).toBe("https://example.test/docs");
    expect(readme.get("img").attributes("src")).toBe("http://example.test/image.png");
    wrapper.unmount();
  });
});

describe("ProjectDrawer save request ordering", () => {
  it("disables and guards an unselected project save while any batch is active", async () => {
    api.updateProject.mockReset();
    const wrapper = mountDrawer(project({ id: 6 }));
    try {
      await wrapper.get(".drawer-edit-btn").trigger("click");
      await wrapper.setProps({ mutationBlocked: true });
      const saveButton = wrapper.get(".drawer-edit-actions .button");
      expect(saveButton.attributes("disabled")).toBeDefined();
      await saveButton.trigger("click");
      expect(api.updateProject).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it("disables and guards save while the same project is busy in another mutation surface", async () => {
    const releaseBatchReservation = reserveProjectMutations([1]);
    api.updateProject.mockReset();
    const wrapper = mountDrawer(project({ id: 1 }));

    try {
      await wrapper.get(".drawer-edit-btn").trigger("click");
      const saveButton = wrapper.get(".drawer-edit-actions .button");
      expect(saveButton.attributes("disabled")).toBeDefined();
      await saveButton.trigger("click");
      expect(api.updateProject).not.toHaveBeenCalled();
    } finally {
      releaseBatchReservation();
      wrapper.unmount();
    }
  });

  it("emits a late successful save for project A without closing the edit form for project B", async () => {
    const saveA = deferred();
    api.updateProject.mockReset();
    api.updateProject.mockReturnValue(saveA.promise);
    const wrapper = mountDrawer(project({ id: 1, name: "Project A" }));

    try {
      await wrapper.get(".drawer-edit-btn").trigger("click");
      await wrapper.get(".drawer-edit-actions .button").trigger("click");
      expect(api.updateProject).toHaveBeenCalledWith(1, expect.any(Object));

      await wrapper.setProps({ project: project({ id: 2, name: "Project B" }) });
      await flushPromises();
      await wrapper.get(".drawer-edit-btn").trigger("click");
      expect(wrapper.find(".drawer-edit-form").exists()).toBe(true);
      expect(wrapper.get(".drawer-edit-actions .button").attributes("disabled")).toBeUndefined();

      const savedA = project({ id: 1, name: "Saved Project A" });
      saveA.resolve(savedA);
      await flushPromises();

      expect(wrapper.emitted("saved")?.at(-1)).toEqual([savedA]);
      expect(wrapper.get(".drawer-title").text()).toBe("Project B");
      expect(wrapper.find(".drawer-edit-form").exists()).toBe(true);
    } finally {
      wrapper.unmount();
      api.updateProject.mockReset();
    }
  });

  it("emits a successful save after Cancel while leaving the edit session closed", async () => {
    const save = deferred();
    api.updateProject.mockReset();
    api.updateProject.mockReturnValue(save.promise);
    const wrapper = mountDrawer(project({ id: 9 }));

    try {
      await wrapper.get(".drawer-edit-btn").trigger("click");
      await wrapper.get("textarea").setValue("saved after cancel");
      await wrapper.get(".drawer-edit-actions .button").trigger("click");
      await wrapper.get(".drawer-edit-actions .ghost-button").trigger("click");
      const updated = project({ id: 9, note: "saved after cancel" });
      save.resolve(updated);
      await flushPromises();

      expect(wrapper.emitted("saved")?.at(-1)).toEqual([updated]);
      expect(wrapper.find(".drawer-edit-form").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      api.updateProject.mockReset();
    }
  });

  it("queues a reopened A save behind the old save and emits only the final new value", async () => {
    const oldSaveA = deferred();
    const newSaveA = deferred();
    api.updateProject.mockReset();
    api.updateProject
      .mockReturnValueOnce(oldSaveA.promise)
      .mockReturnValueOnce(newSaveA.promise);
    const wrapper = mountDrawer(project({ id: 1, name: "Project A" }));

    try {
      await wrapper.get(".drawer-edit-btn").trigger("click");
      await wrapper.get(".drawer-edit-actions .button").trigger("click");
      await wrapper.setProps({ project: project({ id: 2, name: "Project B" }) });
      await flushPromises();
      await wrapper.setProps({ project: project({ id: 1, name: "Project A Reopened" }) });
      await flushPromises();
      await wrapper.get(".drawer-edit-btn").trigger("click");
      expect(wrapper.get(".drawer-edit-actions .button").attributes("disabled")).toBeUndefined();
      await wrapper.get("textarea").setValue("new value");
      await wrapper.get(".drawer-edit-actions .button").trigger("click");
      expect(api.updateProject).toHaveBeenCalledTimes(1);

      oldSaveA.resolve(project({ id: 1, name: "Old Saved A" }));
      await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(2));
      expect(api.updateProject.mock.calls[1][1].note).toBe("new value");
      const savedNewA = project({ id: 1, name: "New Saved A", note: "new value" });
      newSaveA.resolve(savedNewA);
      await flushPromises();

      expect(wrapper.emitted("saved")?.at(-1)).toEqual([savedNewA]);
      expect(wrapper.get(".drawer-title").text()).toBe("Project A Reopened");
      expect(wrapper.find(".drawer-edit-form").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      api.updateProject.mockReset();
    }
  });

  it("sends only R2 edits so a reopened stale form cannot undo a successful R1 field", async () => {
    const saveR1 = deferred();
    const saveR2 = deferred();
    api.updateProject.mockReset();
    api.updateProject
      .mockReturnValueOnce(saveR1.promise)
      .mockReturnValueOnce(saveR2.promise);
    const initialA = project({ id: 1, name: "Project A", note: "before", recommended: false });
    const wrapper = mountDrawer(initialA);

    try {
      await wrapper.get(".drawer-edit-btn").trigger("click");
      await wrapper.get("textarea").setValue("R1 note");
      await wrapper.get(".drawer-edit-actions .button").trigger("click");
      expect(api.updateProject).toHaveBeenNthCalledWith(1, 1, { note: "R1 note" });

      await wrapper.setProps({ project: project({ id: 2, name: "Project B" }) });
      await flushPromises();
      await wrapper.setProps({ project: initialA });
      await flushPromises();
      await wrapper.get(".drawer-edit-btn").trigger("click");
      await wrapper.get('input[type="checkbox"]').setValue(true);
      await wrapper.get(".drawer-edit-actions .button").trigger("click");
      expect(api.updateProject).toHaveBeenCalledTimes(1);

      saveR1.resolve({ ...initialA, note: "R1 note" });
      await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(2));
      expect(api.updateProject).toHaveBeenNthCalledWith(2, 1, { recommended: true });

      const finalA = { ...initialA, note: "R1 note", recommended: true };
      saveR2.resolve(finalA);
      await flushPromises();
      expect(wrapper.emitted("saved")?.at(-1)).toEqual([finalA]);
    } finally {
      wrapper.unmount();
      api.updateProject.mockReset();
    }
  });
});
