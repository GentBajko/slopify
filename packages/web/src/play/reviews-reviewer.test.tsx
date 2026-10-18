import type { ReviewSettingsForm } from "@app/slices/reviews/model.js";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { renderApp, testDeps } from "@/test-app";
import { emptyReviews, ReviewSettings } from "./reviews";

afterEach(cleanup);

function Harness({ seen }: { readonly seen: ReviewSettingsForm[] }): ReactElement {
  const [value, setValue] = useState<ReviewSettingsForm>({
    ...emptyReviews,
    stages: { images: { mode: "flag", prompt: "" } },
  });
  return (
    <ReviewSettings
      value={value}
      providers={[]}
      prompts={[]}
      makes={() => true}
      problem={() => undefined}
      onChange={(next) => {
        seen.push(next);
        setValue(next);
      }}
    />
  );
}

it("offers the external agent as the reviewer and keeps the model pickers, disabled", () => {
  const seen: ReviewSettingsForm[] = [];
  renderApp(<Harness seen={seen} />, testDeps({}));
  fireEvent.click(screen.getByRole("button", { name: "External agent (MCP)" }));
  expect(seen.at(-1)?.reviewer).toBe("agent");
  expect(screen.getByText(/answers through MCP/)).toBeTruthy();
  expect(screen.queryByText(/need Claude Code or Codex/)).toBeNull();
  expect(screen.getByLabelText("Reviewer model").closest("fieldset[disabled]")).not.toBeNull();
});

it("lists the promise check right after the article and greys it, with the reason, for a provided article", () => {
  renderApp(
    <ReviewSettings
      value={emptyReviews}
      providers={[]}
      prompts={[]}
      makes={(stage) => stage !== "article" && stage !== "promise"}
      problem={() => undefined}
      onChange={() => undefined}
    />,
    testDeps({}),
  );
  const rows = screen.getAllByRole("rowheader").map((cell) => cell.textContent);
  expect(rows.slice(0, 2)).toEqual(["Article", "Promise check (before narration)"]);
  const picker = screen.getByLabelText("Promise check (before narration) review");
  expect((picker as HTMLSelectElement).disabled).toBe(true);
  expect(
    screen.getByText("Needs an article a model writes: set Article to Generate to use it."),
  ).toBeTruthy();
});

it("offers the promise check while a model writes the article", () => {
  const seen: ReviewSettingsForm[] = [];
  renderApp(
    <ReviewSettings
      value={emptyReviews}
      providers={[]}
      prompts={[]}
      makes={() => true}
      problem={() => undefined}
      onChange={(next) => seen.push(next)}
    />,
    testDeps({}),
  );
  fireEvent.change(screen.getByLabelText("Promise check (before narration) review"), {
    target: { value: "redo" },
  });
  expect(seen.at(-1)?.stages.promise).toEqual({ mode: "redo", prompt: "" });
  expect(screen.queryByText(/Needs an article a model writes/)).toBeNull();
});
