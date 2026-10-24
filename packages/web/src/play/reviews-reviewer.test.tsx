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

it("offers the external agent as the checker, which needs no service or model", () => {
  const seen: ReviewSettingsForm[] = [];
  renderApp(<Harness seen={seen} />, testDeps({}));
  expect(screen.getByRole("combobox", { name: "Checked by Model" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "External agent (MCP)" }));
  expect(seen.at(-1)?.reviewer).toBe("agent");
  expect(screen.getByText(/answers through MCP/)).toBeTruthy();
  expect(screen.queryByText(/need Claude Code or Codex/)).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Checked by Model" })).toBeNull();
});

it("sets every stage the run makes with one choice, checked by the run's own writer", () => {
  const seen: ReviewSettingsForm[] = [];
  renderApp(
    <ReviewSettings
      value={emptyReviews}
      providers={[]}
      prompts={[]}
      writer={{ provider: "claude-code", model: "sonnet" }}
      makes={(stage) => stage !== "shorts"}
      problem={() => undefined}
      onChange={(next) => seen.push(next)}
    />,
    testDeps({}),
  );
  const all = screen.getByRole("group", { name: "Have an AI check the results" });
  expect(all.querySelector("[aria-pressed=true]")?.textContent).toBe("Off");
  fireEvent.click(screen.getByRole("button", { name: "Flag problems" }));
  expect(seen.at(-1)).toMatchObject({
    provider: "claude-code",
    model: "sonnet",
    stages: {
      article: { mode: "flag" },
      images: { mode: "flag" },
      narration: { mode: "flag" },
      thumbnail: { mode: "flag" },
    },
  });
  // The promise check is its own choice, and a stage the run makes nothing for is left alone.
  expect(seen.at(-1)?.stages.promise).toBeUndefined();
  expect(seen.at(-1)?.stages.shorts).toBeUndefined();
});

it("says when the stages are set differently, and sets none by itself", () => {
  renderApp(
    <ReviewSettings
      value={{
        ...emptyReviews,
        stages: { article: { mode: "redo", prompt: "" }, images: { mode: "flag", prompt: "" } },
      }}
      providers={[]}
      prompts={[]}
      makes={() => true}
      problem={() => undefined}
      onChange={() => undefined}
    />,
    testDeps({}),
  );
  const all = screen.getByRole("group", { name: "Have an AI check the results" });
  expect(all.querySelector("[aria-pressed=true]")).toBeNull();
  expect(screen.getByText("Each stage is set on its own under Advanced.")).not.toBeNull();
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
  const picker = screen.getByLabelText("Promise check (before narration): check");
  expect((picker as HTMLSelectElement).disabled).toBe(true);
  expect(screen.getByText("Needs an article the AI writes.")).toBeTruthy();
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
  fireEvent.change(screen.getByLabelText("Promise check (before narration): check"), {
    target: { value: "redo" },
  });
  expect(seen.at(-1)?.stages.promise).toEqual({ mode: "redo", prompt: "" });
  expect(screen.queryByText(/Needs an article the AI writes/)).toBeNull();
});

// In the narrow Review drawer the two pickers wrap under each other instead of cutting their
// words short ("Flag and re…").
it("puts a stage's check and prompt pickers in one wrapping cell, the prompt once it checks", () => {
  renderApp(
    <ReviewSettings
      value={{ ...emptyReviews, stages: { promise: { mode: "flag", prompt: "" } } }}
      providers={[]}
      prompts={[]}
      makes={() => true}
      problem={() => undefined}
      onChange={() => undefined}
    />,
    testDeps({}),
  );
  expect(screen.queryByLabelText("Article: prompt")).toBeNull();
  const mode = screen.getByLabelText("Promise check (before narration): check");
  const prompt = screen.getByLabelText("Promise check (before narration): prompt");
  const cell = mode.closest("td");
  expect(cell).not.toBeNull();
  expect(cell?.contains(prompt)).toBe(true);
  expect(mode.closest(".flex-wrap")?.contains(prompt)).toBe(true);
});
