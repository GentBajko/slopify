import type { KeywordFacts } from "@app/slices/keywords/values.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { KeywordFactsRefresh, wantsKeywordFacts } from "./keyword-facts-refresh.js";
import { revisionView } from "./revision-fixture.js";

afterEach(cleanup);

function editWith(templates: Record<string, string | null>, facts?: KeywordFacts): RevisionEdit {
  const { config, content } = revisionView().revision;
  const { keywordFacts: _old, ...rest } = config;
  return {
    config: { ...rest, ...(facts === undefined ? {} : { keywordFacts: facts }) },
    content: { ...content, promptTemplates: templates },
  };
}

const fresh: KeywordFacts = { channel: "Quiet Histories", series: "Old histories" };

describe("Refresh keyword facts", () => {
  it("is wanted when a prompt uses a fact keyword or the project has facts", () => {
    expect(wantsKeywordFacts(editWith({ article: "About {{topic}}" }))).toBe(false);
    expect(wantsKeywordFacts(editWith({ article: "By {{Slopify_Title}}" }))).toBe(false);
    expect(wantsKeywordFacts(editWith({ article: "For {{Slopify_Channel}}", x: null }))).toBe(true);
    expect(wantsKeywordFacts(editWith({ article: "Plain" }, { channel: "Old" }))).toBe(true);
  });

  it("copies the facts again into the edit, and says saving remakes what uses a changed one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const edit = editWith({ article: "For {{Slopify_Channel}}" }, { channel: "Old" });
    renderApp(
      <KeywordFactsRefresh projectId="p1" edit={edit} getEdit={() => edit} onChange={onChange} />,
      testDeps({ "GET /api/keywords/facts/p1": jsonAnswer({ keywordFacts: fresh }) }),
    );
    await user.click(screen.getByRole("button", { name: "Refresh keyword facts" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.lastCall?.[0]).toEqual({
      ...edit,
      config: { ...edit.config, keywordFacts: fresh },
    });
    expect(
      screen.getByText(
        "Keyword facts copied again. Save to make again only the steps whose prompts use a fact that changed.",
      ),
    ).not.toBeNull();
    // What it copies, that it is free and what saving then does, under the button in words.
    expect(
      screen.getByText(
        "Copies the channel's name, series brief, links and cast again, free; saving then makes again only what uses a changed fact.",
      ),
    ).not.toBeNull();
  });

  it("says what failed and how to try again, and changes nothing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const edit = editWith({ article: "For {{Slopify_Channel}}" });
    renderApp(
      <KeywordFactsRefresh projectId="gone" edit={edit} getEdit={() => edit} onChange={onChange} />,
      testDeps({
        "GET /api/keywords/facts/gone": problemAnswer(
          "This project no longer exists. Go back to Projects to pick another.",
          404,
        ),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Refresh keyword facts" }));
    expect(
      await screen.findByText(
        "Couldn't refresh the keyword facts: This project no longer exists. Go back to Projects to pick another. Press Refresh keyword facts to try again.",
      ),
    ).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("holds the button while it reads, and applies to the edit as it is by then", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const edit = editWith({ article: "For {{Slopify_Channel}}" });
    const later = { ...edit, config: { ...edit.config, title: "Renamed meanwhile" } };
    renderApp(
      <KeywordFactsRefresh projectId="p1" edit={edit} getEdit={() => later} onChange={onChange} />,
      testDeps({
        "GET /api/keywords/facts/p1": async (request) => {
          await gate;
          return jsonAnswer({ keywordFacts: fresh })(request);
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Refresh keyword facts" }));
    const busy = screen.getByRole("button", { name: "Refreshing keyword facts…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    release();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.lastCall?.[0].config).toEqual({ ...later.config, keywordFacts: fresh });
  });
});
