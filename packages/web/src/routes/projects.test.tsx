import type { ProjectState } from "@app/kernel/pipeline.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { ProjectsRoute } from "./projects.js";

afterEach(cleanup);

function summary(id: string, title: string, status: ProjectState) {
  return {
    id,
    title,
    status,
    format: "16:9",
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("the projects list", () => {
  it("shows skeleton rows while the list is coming", async () => {
    const { container } = renderRouted(<ProjectsRoute />, testDeps({}));
    await waitFor(() => {
      expect(container.querySelectorAll(".rounded-full").length).toBe(3);
    });
  });

  it("teaches where runs come from when there are none", async () => {
    renderRouted(
      <ProjectsRoute />,
      testDeps({ "GET /api/projects": jsonAnswer({ projects: [] }) }),
    );
    expect(await screen.findByText(/No projects yet/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Play" }).getAttribute("href")).toBe("/play");
  });

  it("lists every run with its lamp, its state word and a link into it", async () => {
    renderRouted(
      <ProjectsRoute />,
      testDeps({
        "GET /api/projects": jsonAnswer({
          projects: [summary("p1", "Rope Tricks", "running"), summary("p2", "Knots", "done")],
        }),
      }),
    );

    const row = await screen.findByRole("link", { name: /Rope Tricks/ });
    expect(row.getAttribute("href")).toBe("/projects/p1");
    expect(screen.getByText("running")).not.toBeNull();
    expect(screen.getByText("done")).not.toBeNull();
  });

  it("offers a new run", async () => {
    renderRouted(
      <ProjectsRoute />,
      testDeps({ "GET /api/projects": jsonAnswer({ projects: [] }) }),
    );
    expect((await screen.findByRole("link", { name: "New run" })).getAttribute("href")).toBe(
      "/play",
    );
  });

  it("names the problem when the list cannot be read", async () => {
    renderRouted(
      <ProjectsRoute />,
      testDeps({ "GET /api/projects": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });
});
