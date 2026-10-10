import type { ProjectSummary } from "@app/slices/admission/model.js";
import { defaultVoicesSettings } from "@app/slices/voices/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body } from "@/routes/project-fixtures";
import { renderRouted, testDeps } from "@/test-app";
import { ProjectHeader } from "./header";

afterEach(cleanup);

const plain = body({ status: "done", stages: [], outputs: [] }).project as ProjectSummary;
const chapter: ProjectSummary = {
  ...plain,
  config: {
    ...plain.config,
    voices: { ...defaultVoicesSettings("audiobook"), book: { title: "Sea Tales", chapter: 3 } },
  },
};

it("offers Make the next chapter on a finished audiobook and names its book", async () => {
  const user = userEvent.setup();
  const run = vi.fn();
  renderRouted(
    <ProjectHeader
      project={chapter}
      prompts={undefined}
      editing={false}
      onEdit={() => {}}
      more={[]}
      nextChapter={{ run, pending: false }}
      progress={1}
    />,
    testDeps({}),
  );
  expect(await screen.findByText(/^Sea Tales · Chapter 3 · /)).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Make the next chapter" }));
  expect(run).toHaveBeenCalledOnce();
});

it("has no next chapter for a running audiobook or a video", async () => {
  renderRouted(
    <>
      <ProjectHeader
        project={{ ...chapter, status: "running" }}
        prompts={undefined}
        editing={false}
        onEdit={() => {}}
        more={[]}
        nextChapter={{ run: () => {}, pending: false }}
        progress={1}
      />
      <ProjectHeader
        project={plain}
        prompts={undefined}
        editing={false}
        onEdit={() => {}}
        more={[]}
        nextChapter={{ run: () => {}, pending: false }}
        progress={1}
      />
    </>,
    testDeps({}),
  );
  expect(await screen.findAllByText("Rope Tricks")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Make the next chapter" })).toBeNull();
});

it("says a held or prepared project's state as Projects and the agent tools do", async () => {
  renderRouted(
    <>
      <ProjectHeader
        project={{ ...plain, status: "pending" }}
        prompts={undefined}
        editing={false}
        onEdit={() => {}}
        more={[]}
        progress={0.5}
      />
      <ProjectHeader
        project={{ ...plain, status: "pending", prepared: true }}
        prompts={undefined}
        editing={false}
        onEdit={() => {}}
        more={[]}
        progress={0.5}
      />
      <ProjectHeader
        project={{ ...plain, status: "pending" }}
        prompts={undefined}
        editing={false}
        onEdit={() => {}}
        more={[]}
        progress={0}
      />
    </>,
    testDeps({}),
  );
  expect(await screen.findByText("Waiting for your review")).not.toBeNull();
  expect(screen.getByText("Prepared")).not.toBeNull();
  expect(screen.getByText("Queued")).not.toBeNull();
});
