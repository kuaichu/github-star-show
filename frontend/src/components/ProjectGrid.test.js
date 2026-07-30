import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ProjectGrid from "./ProjectGrid.vue";

function mountGrid(github, extraProps = {}) {
  return mount(ProjectGrid, {
    props: {
      projects: [{
        id: 1,
        name: "Grid project",
        author: "owner",
        category: "收藏",
        status: "收藏备用",
        language: "JavaScript",
        stars: 1,
        updatedAt: "2026-07-26",
        recommended: false,
        description: "",
        github,
        note: "",
        features: [],
        tags: [],
        remoteStatus: "active"
      }],
      totalCount: 1,
      formatDate: value => String(value),
      formatNumber: value => String(value),
      ...extraProps
    }
  });
}

describe("ProjectGrid external links", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "file:///tmp/unsafe",
    "vbscript:msgbox(1)",
    "https://user:password@github.com/owner/repo",
    "https://[invalid"
  ])("renders an invalid GitHub URL as non-clickable text: %s", github => {
    const wrapper = mountGrid(github);
    expect(wrapper.find(".card-actions a").exists()).toBe(false);
    expect(wrapper.get('.card-actions [aria-disabled="true"]').text()).not.toBe("");
    wrapper.unmount();
  });

  it("keeps a valid GitHub HTTPS URL clickable", () => {
    const wrapper = mountGrid("https://github.com/owner/repo");
    expect(wrapper.get(".card-actions a").attributes("href"))
      .toBe("https://github.com/owner/repo");
    wrapper.unmount();
  });
});

describe("ProjectGrid batch selection", () => {
  it("disables row selection and emits no update while a batch is busy", async () => {
    const wrapper = mountGrid("https://github.com/owner/repo", {
      showTriage: true,
      batchBusy: true,
      selectedIds: new Set()
    });
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect(checkbox.attributes("disabled")).toBeDefined();
    await checkbox.trigger("change");
    expect(wrapper.emitted("update:selectedIds")).toBeUndefined();
    wrapper.unmount();
  });
});
