import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { calendarSearchOf, createAppRouter, projectsSearchOf } from "@/router";
import { projectSectionOf } from "@/routes/project";

// Schedules are the calendar's Schedules tab. The addresses they had before, in old links,
// bookmarks and notes, still land there.
async function land(path: string) {
  const router = createAppRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  // The search the calendar reads: its route's validated one.
  return { pathname: router.state.location.pathname, search: router.state.matches.at(-1)?.search };
}

const scheduleId = "22222222-2222-4222-8222-222222222222";

describe("the old schedule addresses", () => {
  it("sends /schedules to the calendar's Schedules tab", async () => {
    expect(await land("/schedules")).toEqual({
      pathname: "/calendar",
      search: { tab: "schedules" },
    });
  });

  it("sends /schedules/$scheduleId to that schedule on the Schedules tab", async () => {
    expect(await land(`/schedules/${scheduleId}`)).toEqual({
      pathname: "/calendar",
      search: { tab: "schedules", schedule: scheduleId },
    });
  });

  it("keeps /calendar on the weeks, and drops a schedule named without the tab", () => {
    expect(calendarSearchOf({ schedule: scheduleId })).toEqual({});
    expect(calendarSearchOf({ tab: "nonsense" })).toEqual({});
    expect(calendarSearchOf({ tab: "schedules", schedule: "../x" })).toEqual({ tab: "schedules" });
  });
});

describe("addresses that keep a place", () => {
  it("keeps a project's section in its address, and drops one that is not a section", async () => {
    expect(await land("/projects/p1?section=images")).toEqual({
      pathname: "/projects/p1",
      search: { section: "images" },
    });
    const odd = (await land("/projects/p1?section=nope")).search as { section?: unknown };
    expect(projectSectionOf(odd.section)).toBe(undefined);
  });

  it("keeps Projects' filter and search words, and leaves All out", () => {
    expect(projectsSearchOf({ show: "failed", q: "myth" })).toEqual({ show: "failed", q: "myth" });
    expect(projectsSearchOf({ show: "all", q: "  " })).toEqual({});
    expect(projectsSearchOf({ show: "nonsense" })).toEqual({});
  });
});
