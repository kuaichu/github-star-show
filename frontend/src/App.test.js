import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ handler: null }));
const api = vi.hoisted(() => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getAiClassificationConfig: vi.fn(),
  getCurrentUser: vi.fn(),
  getGithubLoginUrl: vi.fn(),
  getManagedCategories: vi.fn(),
  getMeta: vi.fn(),
  getMyProjects: vi.fn(),
  getMySyncStatus: vi.fn(),
  getProject: vi.fn(),
  getProjects: vi.fn(),
  importGithubRepo: vi.fn(),
  logout: vi.fn(),
  onAuthInvalidated: vi.fn(handler => {
    authState.handler = handler;
    return () => { authState.handler = null; };
  }),
  recheckRemoteStatus: vi.fn(),
  rerunRuleClassification: vi.fn(),
  runAiClassification: vi.fn(),
  syncGithubStars: vi.fn(),
  updateProject: vi.fn()
}));

vi.mock("./api/projects", () => api);

import App from "./App.vue";
import { setLocale } from "./i18n";
import { queueProjectUpdate, resetProjectMutationQueueForTests } from "./lib/projectMutationQueue";

const SidebarStub = {
  props: ["counts", "categories"],
  emits: ["update:category", "update:remote-status"],
  template: `<div>
    <span data-test="sidebar-total">{{ counts && counts.__all_projects__ }}</span>
    <span data-test="sidebar-categories">{{ (categories || []).join('|') }}</span>
    <button data-test="show-uncategorized" @click="$emit('update:category', '未分类 / 待整理')">uncategorized</button>
    <button data-test="show-unstarred" @click="$emit('update:remote-status', 'unstarred')">unstarred</button>
  </div>`
};

const ProjectGridStub = {
  props: ["projects", "selectedIds", "batchBusy"],
  emits: ["detail", "quick-category", "mark-research", "update:selectedIds"],
  template: `<div data-test="project-grid">
    <template v-for="item in projects" :key="item.id">
      <button :data-test="'open-detail-' + item.id" @click="$emit('detail', item.id)">{{ item.name }}</button>
      <button
        :data-test="'quick-category-' + item.id"
        @click="$emit('quick-category', { id: item.id, category: 'AI / LLM' })"
      >quick category</button>
    </template>
  </div>`
};

const ProjectDrawerStub = {
  props: ["visible", "project"],
  emits: ["close", "saved"],
  methods: {
    saveDetail() {
      this.$emit("saved", { ...this.project, name: "Saved Detail" });
    }
  },
  template: `<div v-if="visible" data-test="active-drawer">
    <span class="drawer-project-name">{{ project?.name }}</span>
    <button data-test="close-detail" @click="$emit('close')">close</button>
    <button data-test="save-detail" @click="saveDetail">save</button>
  </div>`
};

const AdminPanelStub = {
  props: [
    "draft",
    "featuresText",
    "tagsText",
    "message",
    "importRepo",
    "importMessage",
    "selectedProject",
    "saving"
  ],
  template: '<div data-test="admin-panel" />'
};

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        AdminPanel: AdminPanelStub,
        ChangelogDrawer: true,
        ProjectDrawer: ProjectDrawerStub,
        ProjectGrid: ProjectGridStub,
        SidebarPanel: SidebarStub,
        StatsGrid: true,
        ToolbarFilters: true
      }
    }
  });
}

function project(id, category = "未分类 / 待整理") {
  return {
    id,
    name: `Project ${id}`,
    author: "owner",
    category,
    status: "收藏备用",
    language: "JavaScript",
    stars: id,
    updatedAt: "2026-07-26",
    starredAt: "2026-07-26",
    recommended: false,
    description: "",
    github: `https://github.com/owner/project-${id}`,
    demo: "",
    docs: "",
    note: "",
    features: [],
    tags: [],
    remoteStatus: "active"
  };
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

describe("App initialization and access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProjectMutationQueueForTests();
    authState.handler = null;
    setLocale("zh-CN");
    api.getCurrentUser.mockResolvedValue({ user: null, csrfToken: null });
    api.getMeta.mockResolvedValue({ categories: [], statusOptions: [], categoryCounts: {} });
    api.getAiClassificationConfig.mockResolvedValue({ enabled: false });
    api.getMySyncStatus.mockResolvedValue({ lastStarSyncAt: null, recentRuns: [] });
    api.logout.mockResolvedValue(null);
  });

  it("does not render admin or mutation entry points for guests", async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('[data-test="admin-panel"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.text()).not.toContain("打开后台");
    wrapper.unmount();
  });

  it("shows a backend error and retries initialization", async () => {
    api.getCurrentUser
      .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce({ user: null, csrfToken: null });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain("无法连接后端");
    await wrapper.get(".empty-state-action button").trigger("click");
    await flushPromises();

    expect(api.getCurrentUser).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("使用 GitHub 登录");
    wrapper.unmount();
  });

  it("keeps the signed-in UI when logout fails and allows retry", async () => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    api.logout
      .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce(null);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(".more-actions-trigger").trigger("click");
    const logoutButton = wrapper.findAll("button").find(button => button.text() === "退出登录");
    await logoutButton.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("退出失败。请检查连接后重试。");
    expect(wrapper.text()).not.toContain("使用 GitHub 登录");

    await logoutButton.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("使用 GitHub 登录");
    wrapper.unmount();
  });

  it("clears the signed-in UI when the API reports an invalid session", async () => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    const wrapper = mountApp();
    await flushPromises();

    authState.handler();
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.text()).not.toContain("欢迎");
    wrapper.unmount();
  });

  it("does not restore a stale initialization user after auth invalidation", async () => {
    const currentUserRequest = deferred();
    api.getCurrentUser.mockReturnValue(currentUserRequest.promise);
    const wrapper = mountApp();
    expect(authState.handler).toBeTypeOf("function");

    authState.handler();
    currentUserRequest.resolve({ user: { id: 1, login: "stale-user" }, csrfToken: "stale" });
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.text()).not.toContain("stale-user");
    wrapper.unmount();
  });

  it("does not restore a pending authenticated project list after auth invalidation", async () => {
    const pendingProjects = deferred();
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockReturnValue(pendingProjects.promise);
    const wrapper = mountApp();
    await vi.waitFor(() => expect(api.getMyProjects).toHaveBeenCalledTimes(1));

    authState.handler();
    pendingProjects.resolve({ items: [{ ...project(1), name: "Private Project" }] });
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.get('[data-test="sidebar-total"]').text()).toBe("0");
    wrapper.unmount();
  });

  it("treats an initialization projects 401 as a completed transition to Guest", async () => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockImplementation(async () => {
      authState.handler();
      throw Object.assign(new Error("unauthorized"), { status: 401 });
    });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.text()).not.toContain("项目列表加载失败");
    expect(wrapper.find(".empty-state-action").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps a projects initialization 500 visible and retryable", async () => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockRejectedValue(Object.assign(new Error("server"), { status: 500 }));
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain("无法加载项目库");
    expect(wrapper.find(".empty-state-action button").exists()).toBe(true);
    wrapper.unmount();
  });

  it("does not consume a resolved mutation after synchronous auth invalidation", async () => {
    const pendingUpdate = deferred();
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1, "Private Category")] });
    api.getMeta.mockResolvedValue({
      categories: ["Private Category"],
      statusOptions: [],
      categoryCounts: { "Private Category": 1 }
    });
    api.updateProject.mockReturnValue(pendingUpdate.promise);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="quick-category-1"]').trigger("click");
    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(1));
    pendingUpdate.resolve({ ...project(1, "AI / LLM"), name: "Resolved Private Project" });
    authState.handler();
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.find('[data-test="open-detail-1"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="sidebar-total"]').text()).toBe("0");
    expect(wrapper.get('[data-test="sidebar-categories"]').text()).not.toContain("Private Category");
    wrapper.unmount();
  });

  it("sends only changed admin draft fields so stale fields cannot overwrite newer values", async () => {
    const initial = project(1, "Original Category");
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [initial] });
    api.updateProject.mockResolvedValue({ ...initial, note: "edited note" });
    const wrapper = mountApp();
    await flushPromises();

    wrapper.vm.$.setupState.openAdmin();
    wrapper.vm.$.setupState.draft.note = "edited note";
    await wrapper.vm.$.setupState.saveProject();

    expect(api.updateProject).toHaveBeenCalledWith(1, { note: "edited note" });
    wrapper.unmount();
  });

  it("locks the Admin form, project switching, and deletion while save is pending", async () => {
    const pending = deferred();
    const first = project(1, "Original Category");
    const second = project(2, "Other Category");
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [first, second] });
    api.updateProject.mockReturnValue(pending.promise);
    const wrapper = mountApp();
    await flushPromises();

    wrapper.vm.$.setupState.openAdmin();
    wrapper.vm.$.setupState.draft.note = "pending";
    const save = wrapper.vm.$.setupState.saveProject();
    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(1));

    expect(wrapper.getComponent(AdminPanelStub).props("saving")).toBe(true);
    wrapper.vm.$.setupState.selectProjectForEdit(2);
    await wrapper.vm.$.setupState.removeProject(1);
    expect(wrapper.vm.$.setupState.selectedProjectId).toBe(1);
    expect(api.deleteProject).not.toHaveBeenCalled();

    pending.resolve({ ...first, note: "pending" });
    await save;
    expect(wrapper.getComponent(AdminPanelStub).props("saving")).toBe(false);
    wrapper.unmount();
  });

  it("invalidates a resolved mutation before the successful logout continuation runs", async () => {
    const pendingUpdate = deferred();
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1, "Private Category")] });
    api.updateProject.mockReturnValue(pendingUpdate.promise);
    api.logout.mockImplementation(() => {
      pendingUpdate.resolve({ ...project(1, "AI / LLM"), name: "Resolved Private Project" });
      authState.handler();
      return Promise.resolve(null);
    });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="quick-category-1"]').trigger("click");
    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(1));
    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "退出登录").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.find('[data-test="open-detail-1"]').exists()).toBe(false);
    expect(api.getMeta).toHaveBeenCalledTimes(1);
    expect(api.getMyProjects).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("does not expose pending authenticated metadata after auth invalidation", async () => {
    const pendingMeta = deferred();
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    api.getMeta.mockReturnValue(pendingMeta.promise);
    const wrapper = mountApp();
    await vi.waitFor(() => expect(api.getMeta).toHaveBeenCalledTimes(1));

    authState.handler();
    pendingMeta.resolve({
      categories: ["Private Category"],
      statusOptions: ["Private Status"],
      categoryCounts: { "Private Category": 1 }
    });
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.get('[data-test="sidebar-categories"]').text()).not.toContain("Private Category");
    wrapper.unmount();
  });

  it("clears loaded and pending managed categories on auth invalidation", async () => {
    const pendingManagedCategories = deferred();
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    api.getMeta.mockResolvedValue({
      categories: ["Loaded Private Category"],
      statusOptions: [],
      categoryCounts: {}
    });
    api.getManagedCategories.mockReturnValue(pendingManagedCategories.promise);
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.get('[data-test="sidebar-categories"]').text()).toContain("Loaded Private Category");

    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "打开后台").trigger("click");
    await vi.waitFor(() => expect(api.getManagedCategories).toHaveBeenCalledTimes(1));
    authState.handler();
    pendingManagedCategories.resolve({ categories: ["Pending Private Category"] });
    await flushPromises();

    const sidebarCategories = wrapper.get('[data-test="sidebar-categories"]').text();
    expect(sidebarCategories).not.toContain("Loaded Private Category");
    expect(sidebarCategories).not.toContain("Pending Private Category");
    wrapper.unmount();
  });

  it("clears private drafts, inputs, messages, selections, and busy state on auth invalidation", async () => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1, "Private Category")] });
    const wrapper = mountApp();
    await flushPromises();

    const state = wrapper.vm.$.setupState;
    state.draft.note = "Private draft note";
    state.featuresText = "Private feature";
    state.tagsText = "private-tag";
    state.importRepo = "private/repository";
    state.adminMessage = "Private Project saved";
    state.importMessage = "Private import complete";
    state.syncMessage = "Private Category updated";
    state.selectedProjectId = 1;
    state.previousSelectedProjectId = 1;
    state.triageSavingId = 1;
    state.batchSaving = true;
    state.batchOperationBusy = true;
    state.syncing = true;
    state.classifyingAi = true;
    state.reclassifyingRules = true;
    state.recheckingRemote = true;
    state.removingVisible = true;
    state.aiClassificationConfig = { enabled: true, model: "private-model", maxPerRun: 99, includeReadme: true };

    authState.handler();

    expect(state.draft.note).toBe("");
    expect(state.featuresText).toBe("");
    expect(state.tagsText).toBe("");
    expect(state.importRepo).toBe("");
    expect(state.adminMessage).toBe("");
    expect(state.importMessage).toBe("");
    expect(state.syncMessage).toBe("");
    expect(state.selectedProjectId).toBeNull();
    expect(state.previousSelectedProjectId).toBeNull();
    expect(state.triageSavingId).toBeNull();
    expect(state.batchSaving).toBe(false);
    expect(state.batchOperationBusy).toBe(false);
    expect(state.syncing).toBe(false);
    expect(state.classifyingAi).toBe(false);
    expect(state.reclassifyingRules).toBe(false);
    expect(state.recheckingRemote).toBe(false);
    expect(state.removingVisible).toBe(false);
    expect(state.aiClassificationConfig).toEqual({
      enabled: false,
      model: "",
      maxPerRun: 25,
      includeReadme: false
    });
    wrapper.unmount();
  });

  it("does not restore a pending authenticated project list after successful logout", async () => {
    const pendingProjects = deferred();
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects
      .mockResolvedValueOnce({ items: [project(1)] })
      .mockReturnValueOnce(pendingProjects.promise);
    api.rerunRuleClassification.mockResolvedValue({ total: 1, updated: 1 });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "重跑规则分类").trigger("click");
    await vi.waitFor(() => expect(api.getMyProjects).toHaveBeenCalledTimes(2));
    const logoutButton = wrapper.findAll("button").find(button => button.text() === "退出登录");
    await logoutButton.trigger("click");
    await flushPromises();

    pendingProjects.resolve({ items: [{ ...project(1), name: "Private Project" }] });
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.get('[data-test="sidebar-total"]').text()).toBe("0");
    wrapper.unmount();
  });

  it("closes More and synchronously removes its document listener on auth invalidation", async () => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(".more-actions-trigger").trigger("click");
    const added = addSpy.mock.calls.findLast(([event, _handler, capture]) => event === "click" && capture === true);
    expect(added).toBeDefined();

    authState.handler();
    expect(removeSpy).toHaveBeenCalledWith("click", added[1], true);
    await flushPromises();
    expect(wrapper.find(".more-actions-dropdown").exists()).toBe(false);

    wrapper.unmount();
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("closes More and synchronously removes its document listener when logout starts", async () => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    const logoutRequest = deferred();
    api.logout.mockReturnValue(logoutRequest.promise);
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(".more-actions-trigger").trigger("click");
    const added = addSpy.mock.calls.findLast(([event, _handler, capture]) => event === "click" && capture === true);
    const logoutButton = wrapper.findAll("button").find(button => button.text() === "退出登录");
    await logoutButton.trigger("click");
    expect(removeSpy).toHaveBeenCalledWith("click", added[1], true);
    expect(wrapper.find(".more-actions-dropdown").exists()).toBe(false);

    logoutRequest.resolve(null);
    await flushPromises();
    wrapper.unmount();
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("closes a reopened More menu and removes its listener when pending logout succeeds", async () => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    const logoutRequest = deferred();
    api.logout.mockReturnValue(logoutRequest.promise);
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const wrapper = mountApp();

    try {
      await flushPromises();
      await wrapper.get(".more-actions-trigger").trigger("click");
      const logoutButton = wrapper.findAll("button").find(button => button.text() === "退出登录");
      await logoutButton.trigger("click");
      expect(wrapper.find(".more-actions-dropdown").exists()).toBe(false);

      await wrapper.get(".more-actions-trigger").trigger("click");
      const reopenedListener = addSpy.mock.calls.findLast(
        ([event, _handler, capture]) => event === "click" && capture === true
      );
      expect(wrapper.find(".more-actions-dropdown").exists()).toBe(true);

      logoutRequest.resolve(null);
      await flushPromises();

      expect(api.logout).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith("click", reopenedListener[1], true);
      expect(wrapper.find(".more-actions-dropdown").exists()).toBe(false);
      expect(wrapper.text()).toContain("使用 GitHub 登录");
    } finally {
      wrapper.unmount();
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  it("does not issue a duplicate logout request while logout is pending", async () => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    const logoutRequest = deferred();
    api.logout.mockReturnValue(logoutRequest.promise);
    const wrapper = mountApp();

    try {
      await flushPromises();
      await wrapper.get(".more-actions-trigger").trigger("click");
      const logoutButton = wrapper.findAll("button").find(button => button.text() === "退出登录");
      await logoutButton.trigger("click");

      await wrapper.get(".more-actions-trigger").trigger("click");
      const reopenedLogoutButton = wrapper.findAll("button").find(button => button.text() === "退出登录");
      expect(reopenedLogoutButton.attributes("disabled")).toBeDefined();
      await reopenedLogoutButton.trigger("click");
      expect(api.logout).toHaveBeenCalledTimes(1);

      logoutRequest.resolve(null);
      await flushPromises();
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    ["more actions", ".more-actions-trigger"],
    ["page size", ".page-size-trigger"]
  ])("removes the %s document listener when unmounted while open", async (_name, selector) => {
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(selector).trigger("click");
    const added = addSpy.mock.calls.findLast(([event, _handler, capture]) => event === "click" && capture === true);
    expect(added).toBeDefined();
    wrapper.unmount();

    expect(removeSpy).toHaveBeenCalledWith("click", added[1], true);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe("batch selection and partial failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProjectMutationQueueForTests();
    authState.handler = null;
    setLocale("zh-CN");
    const items = Array.from({ length: 30 }, (_, index) => project(index + 1));
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMeta.mockResolvedValue({
      categories: ["未分类 / 待整理", "AI / LLM"],
      statusOptions: ["收藏备用", "待研究"],
      categoryCounts: {}
    });
    api.getMyProjects.mockResolvedValue({ items });
    api.getProjects.mockResolvedValue({ items: [], stats: [] });
    api.getAiClassificationConfig.mockResolvedValue({ enabled: false });
    api.getMySyncStatus.mockResolvedValue({ lastStarSyncAt: null, recentRuns: [] });
    api.updateProject.mockImplementation(async (id, payload) => {
      if (id === 30) throw new Error("write failed");
      return { ...items.find(item => item.id === id), ...payload };
    });
  });

  it("uses zero-count meta categories while separating page and filtered selection", async () => {
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-test="show-uncategorized"]').trigger("click");
    await flushPromises();

    await wrapper.get("#batch-select-all").setValue(true);
    expect(wrapper.text()).toContain("已选 24 项");

    const selectFiltered = wrapper.findAll("button").find(button => button.text().includes("选择全部 30 个筛选结果"));
    await selectFiltered.trigger("click");
    expect(wrapper.text()).toContain("已选 30 项");

    const categoryButton = wrapper.findAll("button").find(button => button.text() === "AI / LLM");
    await categoryButton.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("成功 29 个，失败 1 个，跳过 0 个");
    expect(wrapper.text()).toContain("已选 1 项");
    expect(api.updateProject.mock.calls.every(([, payload]) =>
      JSON.stringify(payload) === JSON.stringify({ category: "AI / LLM" })
    )).toBe(true);
    expect(api.getMeta).toHaveBeenCalledTimes(2);
    expect(api.getMyProjects).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("ignores every selection update while a batch operation is busy", async () => {
    const wrapper = mountApp();
    await flushPromises();
    const state = wrapper.vm.$.setupState;
    state.batchSelectedIds = new Set([1]);
    state.batchOperationBusy = true;

    state.handleBatchSelectionUpdate(new Set([2]));
    state.toggleSelectAll();
    state.toggleSelectAllFiltered();

    expect([...state.batchSelectedIds]).toEqual([1]);
    wrapper.unmount();
  });

  it("limits 100 batch mutations to a fixed small concurrency", async () => {
    const items = Array.from({ length: 100 }, (_, index) => project(index + 1));
    api.getMyProjects.mockResolvedValue({ items });
    let active = 0;
    let maxActive = 0;
    api.updateProject.mockImplementation(async (id, payload) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active -= 1;
      return { ...items[id - 1], ...payload };
    });
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-test="show-uncategorized"]').trigger("click");
    await wrapper.findAll("button").find(button => button.text().includes("选择全部 100 个筛选结果")).trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "AI / LLM").trigger("click");
    await vi.waitFor(() => expect(wrapper.text()).toContain("成功 100 个，失败 0 个，跳过 0 个"));
    await flushPromises();

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(wrapper.text()).toContain("成功 100 个，失败 0 个，跳过 0 个");
    wrapper.unmount();
  });

  it("deducts an already-running Drawer mutation from the four-worker batch budget", async () => {
    const items = Array.from({ length: 5 }, (_, index) => project(index + 1));
    api.getMyProjects.mockResolvedValue({ items });
    const requests = [];
    let active = 0;
    let maxActive = 0;
    api.updateProject.mockImplementation((id, payload) => {
      const gate = deferred();
      active += 1;
      maxActive = Math.max(maxActive, active);
      requests.push({ id, gate });
      return gate.promise.then(() => {
        active -= 1;
        return { ...items[id - 1], ...payload };
      });
    });
    const wrapper = mountApp();
    await flushPromises();
    const state = wrapper.vm.$.setupState;

    const drawerMutation = queueProjectUpdate(1, { note: "drawer write" });
    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(1));
    state.batchSelectedIds = new Set([2, 3, 4, 5]);
    const batchMutation = state.batchCategorize("AI / LLM");

    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(4));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(api.updateProject).toHaveBeenCalledTimes(4);
    expect(maxActive).toBe(4);

    requests.find(request => request.id !== 1).gate.resolve();
    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(5));
    expect(maxActive).toBe(4);
    requests.forEach(request => request.gate.resolve());
    await Promise.all([drawerMutation.promise, batchMutation]);

    expect(maxActive).toBe(4);
    wrapper.unmount();
  });

  it("keeps a successful batch PATCH when the immediate list reload is stale", async () => {
    const initial = { ...project(1), category: "未分类 / 待整理" };
    api.getMyProjects
      .mockResolvedValueOnce({ items: [initial] })
      .mockResolvedValueOnce({ items: [{ ...initial }] });
    api.updateProject.mockResolvedValue({ ...initial, category: "AI / LLM" });
    const wrapper = mountApp();
    await flushPromises();
    const state = wrapper.vm.$.setupState;
    state.batchSelectedIds = new Set([1]);

    await state.batchCategorize("AI / LLM");
    await flushPromises();

    expect(state.projects.find(item => item.id === 1).category).toBe("AI / LLM");
    wrapper.unmount();
  });

  it("keeps a successful batch DELETE tombstoned when the immediate list reload is stale", async () => {
    const initial = project(1);
    api.getMyProjects
      .mockResolvedValueOnce({ items: [initial] })
      .mockResolvedValueOnce({ items: [{ ...initial }] });
    api.deleteProject.mockResolvedValue({ success: true });
    const wrapper = mountApp();
    await flushPromises();
    const state = wrapper.vm.$.setupState;
    state.batchSelectedIds = new Set([1]);

    await state.retryFailedDeletes();
    await flushPromises();

    expect(state.projects.some(item => item.id === 1)).toBe(false);
    expect([...state.batchSelectedIds]).toEqual([]);
    wrapper.unmount();
  });

  it("stops batch workers from dispatching new mutations after auth invalidation", async () => {
    const items = Array.from({ length: 100 }, (_, index) => project(index + 1));
    api.getMyProjects.mockResolvedValue({ items });
    const firstWave = deferred();
    api.updateProject.mockImplementation(async (id, payload) => {
      await firstWave.promise;
      return { ...items[id - 1], ...payload };
    });
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-test="show-uncategorized"]').trigger("click");
    await wrapper.findAll("button").find(button =>
      button.text().includes("选择全部 100 个筛选结果")).trigger("click");

    void wrapper.findAll("button").find(button => button.text() === "AI / LLM").trigger("click");
    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(4));
    expect(wrapper.vm.$.setupState.busyProjectIds.has(100)).toBe(true);
    authState.handler();
    firstWave.resolve();
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(api.updateProject).toHaveBeenCalledTimes(4);
    wrapper.unmount();
  });

  it("serializes update and delete batch families under one global worker budget", async () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      ...project(index + 1),
      remoteStatus: "unstarred"
    }));
    api.getMyProjects.mockResolvedValue({ items });
    const gate = deferred();
    let active = 0;
    let maxActive = 0;
    const activeById = new Map();
    const overlappingIds = new Set();

    async function trackedMutation(kind, id, value) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const activeKinds = activeById.get(id) || new Set();
      if (activeKinds.size > 0 && !activeKinds.has(kind)) overlappingIds.add(id);
      activeKinds.add(kind);
      activeById.set(id, activeKinds);
      await gate.promise;
      activeKinds.delete(kind);
      active -= 1;
      return value;
    }

    api.updateProject.mockImplementation((id, payload) =>
      trackedMutation("PATCH", id, { ...items[id - 1], ...payload }));
    api.deleteProject.mockImplementation(id => trackedMutation("DELETE", id, null));
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-test="show-uncategorized"]').trigger("click");
    await wrapper.get('[data-test="show-unstarred"]').trigger("click");
    await wrapper.findAll("button").find(button => button.text().includes("选择全部 8 个筛选结果")).trigger("click");

    const categoryButton = wrapper.findAll("button").find(button => button.text() === "AI / LLM");
    const removeButton = wrapper.findAll("button").find(button => button.text() === "从本地移除当前项目");
    try {
      void categoryButton.trigger("click");
      void removeButton.trigger("click");
      await vi.waitFor(() => expect(api.updateProject.mock.calls.length).toBeGreaterThan(0));
      await new Promise(resolve => setTimeout(resolve, 20));
      const deleteCallsWhileUpdateBusy = api.deleteProject.mock.calls.length;
      expect(categoryButton.attributes("disabled")).toBeDefined();
      expect(removeButton.attributes("disabled")).toBeDefined();
      gate.resolve();
      await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(8));
      await flushPromises();

      expect(deleteCallsWhileUpdateBusy).toBe(0);
      expect(maxActive).toBeLessThanOrEqual(4);
      expect(overlappingIds.size).toBe(0);

      wrapper.vm.$.setupState.filters.category = "__all_projects__";
      await flushPromises();
      await wrapper.findAll("button").find(button => button.text() === "从本地移除当前项目").trigger("click");
      await vi.waitFor(() => expect(api.deleteProject).toHaveBeenCalledTimes(8));
    } finally {
      gate.resolve();
      confirmMock.mockRestore();
      wrapper.unmount();
    }
  });

  it("prevents a quick project PATCH from overlapping a batch DELETE for the same id", async () => {
    const item = { ...project(1), remoteStatus: "unstarred" };
    api.getMyProjects.mockResolvedValue({ items: [item] });
    const patchGate = deferred();
    let patchActive = false;
    let overlapped = false;
    api.updateProject.mockImplementation(async (_id, payload) => {
      patchActive = true;
      await patchGate.promise;
      patchActive = false;
      return { ...item, ...payload };
    });
    api.deleteProject.mockImplementation(async () => {
      if (patchActive) overlapped = true;
      return null;
    });
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-test="show-uncategorized"]').trigger("click");
    await wrapper.get('[data-test="show-unstarred"]').trigger("click");

    await wrapper.get('[data-test="quick-category-1"]').trigger("click");
    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(1));
    const removeButton = wrapper.findAll("button").find(button => button.text() === "从本地移除当前项目");
    await removeButton.trigger("click");
    expect(removeButton.attributes("disabled")).toBeDefined();
    expect(api.deleteProject).not.toHaveBeenCalled();

    patchGate.resolve();
    await vi.waitFor(() => expect(wrapper.text()).toContain("已归类到"));
    await wrapper.findAll("button").find(button => button.text() === "返回全部项目").trigger("click");
    await wrapper.get('[data-test="show-unstarred"]').trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "从本地移除当前项目").trigger("click");
    await vi.waitFor(() => expect(api.deleteProject).toHaveBeenCalledTimes(1));
    expect(overlapped).toBe(false);

    confirmMock.mockRestore();
    wrapper.unmount();
  });

  it("reports refresh failures after a batch without losing failed ids", async () => {
    api.getMeta
      .mockResolvedValueOnce({ categories: ["未分类 / 待整理", "AI / LLM"], statusOptions: [], categoryCounts: {} })
      .mockRejectedValueOnce(new Error("meta reload failed"));
    api.getMyProjects
      .mockResolvedValueOnce({ items: [project(1), project(2)] })
      .mockRejectedValueOnce(new Error("projects reload failed"));
    api.updateProject.mockImplementation(async (id, payload) => {
      if (id === 2) throw new Error("write failed");
      return { ...project(id), ...payload };
    });
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-test="show-uncategorized"]').trigger("click");
    await wrapper.findAll("button").find(button => button.text().includes("选择全部 2 个筛选结果")).trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "AI / LLM").trigger("click");
    await vi.waitFor(() => expect(wrapper.text()).toContain("服务端结果刷新失败"));
    await flushPromises();

    expect(wrapper.text()).toContain("成功 1 个，失败 1 个，跳过 0 个");
    expect(wrapper.text()).toContain("服务端结果刷新失败");
    expect(wrapper.text()).toContain("已选 1 项");
    wrapper.unmount();
  });

  it("uses the same worker limit for 100 deletes and retains failed ids", async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      ...project(index + 1),
      remoteStatus: "unstarred"
    }));
    api.getMyProjects
      .mockResolvedValueOnce({ items })
      .mockResolvedValueOnce({ items: [items[99]] })
      .mockResolvedValueOnce({ items: [] });
    let active = 0;
    let maxActive = 0;
    let failedOnce = false;
    api.deleteProject.mockImplementation(async id => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active -= 1;
      if (id === 100 && !failedOnce) {
        failedOnce = true;
        throw new Error("delete failed");
      }
      return null;
    });
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-test="show-unstarred"]').trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "从本地移除当前项目").trigger("click");
    await vi.waitFor(() => expect(wrapper.text()).toContain("成功 99 个，失败 1 个"));
    await flushPromises();

    expect(api.deleteProject).toHaveBeenCalledTimes(100);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(api.getMeta).toHaveBeenCalledTimes(2);
    expect(api.getMyProjects).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-test="delete-failure-bar"]').text()).toContain("1");
    await wrapper.get('[data-test="retry-failed-deletes"]').trigger("click");
    await vi.waitFor(() => expect(api.getMyProjects).toHaveBeenCalledTimes(3));
    await flushPromises();
    expect(wrapper.find('[data-test="delete-failure-bar"]').exists()).toBe(false);
    expect(api.deleteProject).toHaveBeenCalledTimes(101);
    expect(api.getMeta).toHaveBeenCalledTimes(3);
    expect(api.getMyProjects).toHaveBeenCalledTimes(3);
    confirmMock.mockRestore();
    wrapper.unmount();
  });
});

describe("AI config request state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.handler = null;
    setLocale("zh-CN");
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMeta.mockResolvedValue({ categories: [], statusOptions: [], categoryCounts: {} });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    api.getMySyncStatus.mockResolvedValue({ lastStarSyncAt: null, recentRuns: [] });
    api.logout.mockResolvedValue(null);
  });

  it("shows config failure with retry instead of presenting AI as disabled", async () => {
    api.getAiClassificationConfig
      .mockRejectedValueOnce(new Error("config failed"))
      .mockResolvedValueOnce({ enabled: false, model: "", maxPerRun: 25, includeReadme: false });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain("AI 分类配置加载失败");
    expect(wrapper.text()).not.toContain("目前处于关闭状态");
    await wrapper.get('[data-test="retry-ai-config"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("目前处于关闭状态");
    expect(api.getAiClassificationConfig).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("does not restore a pending private config after logout", async () => {
    const pendingConfig = deferred();
    api.getAiClassificationConfig.mockReturnValue(pendingConfig.promise);
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.text()).toContain("正在加载 AI 分类配置");

    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "退出登录").trigger("click");
    pendingConfig.resolve({ enabled: true, model: "private-model", maxPerRun: 99, includeReadme: true });
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.vm.$.setupState.aiConfigState).toBe("unavailable");
    expect(wrapper.vm.$.setupState.aiClassificationConfig.enabled).toBe(false);
    wrapper.unmount();
  });

  it("keeps the newest config when an older request resolves last", async () => {
    const older = deferred();
    const newer = deferred();
    api.getAiClassificationConfig
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const wrapper = mountApp();
    await flushPromises();
    const state = wrapper.vm.$.setupState;

    const newestRequest = state.loadAiConfig();
    newer.resolve({ enabled: true, model: "new-model", maxPerRun: 10, includeReadme: false });
    await newestRequest;
    older.resolve({ enabled: false, model: "old-model", maxPerRun: 1, includeReadme: true });
    await flushPromises();

    expect(state.aiConfigState).toBe("loaded");
    expect(state.aiClassificationConfig.model).toBe("new-model");
    wrapper.unmount();
  });
});

describe("sync status state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.handler = null;
    setLocale("zh-CN");
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMeta.mockResolvedValue({ categories: [], statusOptions: [], categoryCounts: {} });
    api.getMyProjects.mockResolvedValue({ items: [project(1)] });
    api.getAiClassificationConfig.mockResolvedValue({ enabled: false });
    api.syncGithubStars.mockResolvedValue({ mode: "incremental", total: 1 });
    api.logout.mockResolvedValue(null);
  });

  it("shows loading and keeps the default sync disabled until status is loaded", async () => {
    let resolveStatus;
    api.getMySyncStatus.mockReturnValue(new Promise(resolve => { resolveStatus = resolve; }));
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain("正在加载同步状态");
    expect(wrapper.get('[data-test="primary-sync"]').attributes("disabled")).toBeDefined();

    resolveStatus({ lastStarSyncAt: "2026-07-26T00:00:00.000Z", recentRuns: [] });
    await flushPromises();
    expect(wrapper.text()).toContain("上次 GitHub Star 同步时间");
    expect(wrapper.get('[data-test="primary-sync"]').attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("shows an error and retry instead of never-synced, and disables the default sync", async () => {
    api.getMySyncStatus
      .mockRejectedValueOnce(new Error("status failed"))
      .mockResolvedValueOnce({ lastStarSyncAt: null, recentRuns: [] });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain("同步状态加载失败");
    expect(wrapper.text()).not.toContain("你还没有同步过");
    expect(wrapper.get('[data-test="primary-sync"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-test="retry-sync-status"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("你还没有同步过");
    expect(wrapper.get('[data-test="primary-sync"]').attributes("disabled")).toBeUndefined();
    expect(api.getMySyncStatus).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("allows an explicit incremental sync when status is unavailable without choosing a default", async () => {
    api.getMySyncStatus.mockRejectedValue(new Error("status failed"));
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="primary-sync"]').trigger("click");
    expect(api.syncGithubStars).not.toHaveBeenCalled();
    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.get('[data-test="manual-sync-incremental"]').trigger("click");
    await flushPromises();

    expect(api.syncGithubStars).toHaveBeenCalledWith({ mode: "incremental" });
    wrapper.unmount();
  });

  it("sends both explicitly selected full and incremental sync modes", async () => {
    api.getMySyncStatus.mockResolvedValue({ lastStarSyncAt: "2026-07-26T00:00:00.000Z", recentRuns: [] });
    api.syncGithubStars
      .mockResolvedValueOnce({ mode: "full", total: 1 })
      .mockResolvedValueOnce({ mode: "incremental", total: 1 });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.get('[data-test="manual-sync-full"]').trigger("click");
    await vi.waitFor(() => expect(api.syncGithubStars).toHaveBeenCalledTimes(1));
    await flushPromises();
    await wrapper.get('[data-test="manual-sync-incremental"]').trigger("click");
    await vi.waitFor(() => expect(api.syncGithubStars).toHaveBeenCalledTimes(2));

    expect(api.syncGithubStars.mock.calls).toEqual([
      [{ mode: "full" }],
      [{ mode: "incremental" }]
    ]);
    wrapper.unmount();
  });

  it("ignores an older initialization status response that resolves after a post-sync refresh", async () => {
    let resolveInitialStatus;
    let resolveLatestStatus;
    api.getMySyncStatus
      .mockReturnValueOnce(new Promise(resolve => { resolveInitialStatus = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveLatestStatus = resolve; }));
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.get('[data-test="manual-sync-incremental"]').trigger("click");
    await vi.waitFor(() => expect(api.getMySyncStatus).toHaveBeenCalledTimes(2));

    resolveLatestStatus({ lastStarSyncAt: "2026-07-27T00:00:00.000Z", recentRuns: [] });
    await flushPromises();
    expect(wrapper.get('[data-test="primary-sync"]').text()).toContain("同步新增 Stars");

    resolveInitialStatus({ lastStarSyncAt: null, recentRuns: [] });
    await flushPromises();
    expect(wrapper.get('[data-test="primary-sync"]').text()).toContain("同步新增 Stars");
    expect(wrapper.text()).not.toContain("你还没有同步过 GitHub Stars");
    wrapper.unmount();
  });

  it("starts the post-sync status refresh even when another refresh fails", async () => {
    const initialStatus = deferred();
    api.getMeta
      .mockResolvedValueOnce({ categories: [], statusOptions: [], categoryCounts: {} })
      .mockRejectedValueOnce(new Error("meta refresh failed"));
    api.getMySyncStatus
      .mockReturnValueOnce(initialStatus.promise)
      .mockResolvedValueOnce({ lastStarSyncAt: "2026-07-27T00:00:00.000Z", recentRuns: [] });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.get('[data-test="manual-sync-incremental"]').trigger("click");
    await vi.waitFor(() => expect(api.getMeta).toHaveBeenCalledTimes(2));

    initialStatus.resolve({ lastStarSyncAt: null, recentRuns: [] });
    await flushPromises();

    expect(api.getMySyncStatus).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-test="primary-sync"]').text()).toContain("同步新增 Stars");
    expect(wrapper.text()).not.toContain("你还没有同步过 GitHub Stars");
    wrapper.unmount();
  });

  it("ignores a pending sync status response after auth invalidation", async () => {
    const pendingStatus = deferred();
    api.getMySyncStatus.mockReturnValue(pendingStatus.promise);
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain("正在加载同步状态");
    authState.handler();
    pendingStatus.resolve({ lastStarSyncAt: "2026-07-27T00:00:00.000Z", recentRuns: [] });
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.text()).not.toContain("上次 GitHub Star 同步时间");
    expect(wrapper.find('[data-test="primary-sync"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("ignores a pending sync status response after successful logout", async () => {
    const pendingStatus = deferred();
    api.getMySyncStatus.mockReturnValue(pendingStatus.promise);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(".more-actions-trigger").trigger("click");
    const logoutButton = wrapper.findAll("button").find(button => button.text() === "退出登录");
    await logoutButton.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("使用 GitHub 登录");

    pendingStatus.resolve({ lastStarSyncAt: "2026-07-27T00:00:00.000Z", recentRuns: [] });
    await flushPromises();

    expect(wrapper.text()).toContain("使用 GitHub 登录");
    expect(wrapper.text()).not.toContain("上次 GitHub Star 同步时间");
    expect(wrapper.find('[data-test="primary-sync"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("project detail request ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.handler = null;
    setLocale("zh-CN");
    api.getCurrentUser.mockResolvedValue({ user: { id: 1, login: "user" }, csrfToken: "csrf" });
    api.getMeta.mockResolvedValue({ categories: [], statusOptions: [], categoryCounts: {} });
    api.getMyProjects.mockResolvedValue({ items: [project(1), project(2)] });
    api.getAiClassificationConfig.mockResolvedValue({ enabled: false });
    api.getMySyncStatus.mockResolvedValue({ lastStarSyncAt: null, recentRuns: [] });
    api.rerunRuleClassification.mockResolvedValue({ total: 1, updated: 1 });
    api.logout.mockResolvedValue(null);
  });

  it("keeps the last-clicked project when detail responses resolve in reverse order", async () => {
    const requestA = deferred();
    const requestB = deferred();
    api.getProject.mockImplementation(id => id === 1 ? requestA.promise : requestB.promise);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="open-detail-1"]').trigger("click");
    await wrapper.get('[data-test="open-detail-2"]').trigger("click");
    requestB.resolve({ ...project(2), name: "Detail B" });
    await flushPromises();
    expect(wrapper.get(".drawer-project-name").text()).toBe("Detail B");

    requestA.resolve({ ...project(1), name: "Detail A" });
    await flushPromises();
    expect(wrapper.get(".drawer-project-name").text()).toBe("Detail B");
    wrapper.unmount();
  });

  it("shows the latest detail failure and retries it without an unhandled rejection", async () => {
    api.getProject
      .mockRejectedValueOnce(new Error("detail failed"))
      .mockResolvedValueOnce({ ...project(1), name: "Retried Detail" });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="open-detail-1"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-test="detail-load-error"]').text()).toContain("项目详情加载失败");

    await wrapper.get('[data-test="detail-load-error"] button').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-test="detail-load-error"]').exists()).toBe(false);
    expect(wrapper.get(".drawer-project-name").text()).toBe("Retried Detail");
    wrapper.unmount();
  });

  it("silently discards an older detail failure after a newer request succeeds", async () => {
    const requestA = deferred();
    api.getProject.mockImplementation(id => id === 1
      ? requestA.promise
      : Promise.resolve({ ...project(2), name: "Newest Detail" }));
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="open-detail-1"]').trigger("click");
    await wrapper.get('[data-test="open-detail-2"]').trigger("click");
    await flushPromises();
    requestA.reject(new Error("stale detail failure"));
    await flushPromises();

    expect(wrapper.find('[data-test="detail-load-error"]').exists()).toBe(false);
    expect(wrapper.get(".drawer-project-name").text()).toBe("Newest Detail");
    wrapper.unmount();
  });

  it("does not reopen a closed drawer when a pending detail response arrives", async () => {
    const requestB = deferred();
    api.getProject.mockImplementation(id => id === 1
      ? Promise.resolve({ ...project(1), name: "Detail A" })
      : requestB.promise);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="open-detail-1"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-test="open-detail-2"]').trigger("click");
    await wrapper.get('[data-test="close-detail"]').trigger("click");
    requestB.resolve({ ...project(2), name: "Late Detail B" });
    await flushPromises();

    expect(wrapper.find('[data-test="active-drawer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("does not restore pending detail state after auth invalidation", async () => {
    const pending = deferred();
    api.getProject.mockReturnValue(pending.promise);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="open-detail-1"]').trigger("click");
    authState.handler();
    pending.resolve({ ...project(1), name: "Late authenticated detail" });
    await flushPromises();

    expect(wrapper.find('[data-test="active-drawer"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("使用 GitHub 登录");
    wrapper.unmount();
  });

  it("does not restore pending detail state after successful logout", async () => {
    const pending = deferred();
    api.getProject.mockReturnValue(pending.promise);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="open-detail-1"]').trigger("click");
    await wrapper.get(".more-actions-trigger").trigger("click");
    const logoutButton = wrapper.findAll("button").find(button => button.text() === "退出登录");
    await logoutButton.trigger("click");
    await flushPromises();
    pending.resolve({ ...project(1), name: "Late logged-out detail" });
    await flushPromises();

    expect(wrapper.find('[data-test="active-drawer"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("使用 GitHub 登录");
    wrapper.unmount();
  });

  it("does not let an older background detail refresh overwrite a drawer save", async () => {
    const backgroundRefresh = deferred();
    api.getProject
      .mockResolvedValueOnce({ ...project(1), name: "Initial Detail" })
      .mockReturnValueOnce(backgroundRefresh.promise);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="open-detail-1"]').trigger("click");
    await flushPromises();
    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "重跑规则分类").trigger("click");
    await vi.waitFor(() => expect(api.getProject).toHaveBeenCalledTimes(2));

    await wrapper.get('[data-test="save-detail"]').trigger("click");
    backgroundRefresh.resolve({ ...project(1), name: "Stale Background Detail" });
    await flushPromises();

    expect(wrapper.get(".drawer-project-name").text()).toBe("Saved Detail");
    wrapper.unmount();
  });

  it("does not let an older project list refresh overwrite a drawer save", async () => {
    const backgroundList = deferred();
    api.getMyProjects
      .mockResolvedValueOnce({ items: [project(1)] })
      .mockReturnValueOnce(backgroundList.promise);
    api.getProject
      .mockResolvedValueOnce({ ...project(1), name: "Initial Detail" })
      .mockResolvedValueOnce({ ...project(1), name: "Saved Detail" });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="open-detail-1"]').trigger("click");
    await flushPromises();
    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "重跑规则分类").trigger("click");
    await vi.waitFor(() => expect(api.getMyProjects).toHaveBeenCalledTimes(2));

    await wrapper.get('[data-test="save-detail"]').trigger("click");
    backgroundList.resolve({ items: [{ ...project(1), name: "Stale List Project" }, project(2)] });
    await flushPromises();

    expect(wrapper.get('[data-test="open-detail-1"]').text()).toBe("Saved Detail");
    expect(wrapper.get('[data-test="open-detail-2"]').text()).toBe("Project 2");
    wrapper.unmount();
  });

  it("does not let a late save for project A invalidate a pending detail request for project B", async () => {
    const projectBDetail = deferred();
    api.getProject
      .mockResolvedValueOnce({ ...project(1), name: "Detail A" })
      .mockReturnValueOnce(projectBDetail.promise);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-test="open-detail-1"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-test="close-detail"]').trigger("click");
    await wrapper.get('[data-test="open-detail-2"]').trigger("click");

    wrapper.findComponent(ProjectDrawerStub).vm.$emit("saved", {
      ...project(1),
      name: "Late Saved A"
    });
    projectBDetail.resolve({ ...project(2), name: "Detail B" });
    await flushPromises();

    expect(wrapper.get(".drawer-project-name").text()).toBe("Detail B");
    wrapper.unmount();
  });

  it("keeps rule reclassification successful and refreshes projects when meta refresh fails", async () => {
    api.getMeta
      .mockResolvedValueOnce({ categories: [], statusOptions: [], categoryCounts: {} })
      .mockRejectedValueOnce(new Error("meta refresh failed"));
    api.getMyProjects
      .mockResolvedValueOnce({ items: [project(1)] })
      .mockResolvedValueOnce({ items: [project(1), project(2)] });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get(".more-actions-trigger").trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "重跑规则分类").trigger("click");
    await vi.waitFor(() => expect(api.getMyProjects).toHaveBeenCalledTimes(2));
    await flushPromises();

    expect(wrapper.get('[data-test="open-detail-2"]').text()).toBe("Project 2");
    expect(wrapper.text()).toContain("规则分类完成。共处理 1 个项目，刷新了 1 个。");
    expect(wrapper.text()).toContain("服务端结果刷新失败，请重试。");
    expect(wrapper.text()).not.toContain("meta refresh failed");
    wrapper.unmount();
  });
});
