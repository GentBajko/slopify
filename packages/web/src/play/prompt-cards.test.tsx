import type { Prompt } from "@app/slices/library/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderRouted, testDeps } from "@/test-app";
import { PromptCards, promptGist } from "./prompt-cards";

afterEach(cleanup);

const prompt = (name: string, body: string, kind: Prompt["kind"] = "article"): Prompt => ({
  id: name,
  kind,
  name,
  body,
  slots: [],
  updatedAt: "2026-10-01",
});

describe("what a prompt makes, read from its text", () => {
  it("says its first sentence with each keyword in words, and how long it asks for", () => {
    expect(
      promptGist(
        "Write a long, calm bedtime telling of {{Topic}} for listeners who want to drift off to sleep.\n\nLength: 2800-3200 words.",
      ),
    ).toEqual({
      sentence:
        "Write a long, calm bedtime telling of the topic for listeners who want to drift off to sleep.",
      length: "About 20 min · 2800-3200 words",
    });
  });

  it("drops a Subject label and keeps one sentence", () => {
    expect(
      promptGist(
        "Subject: one surprising, true story about {{Topic}}. Then more.\nabout 150 words",
      ),
    ).toEqual({
      sentence: "One surprising, true story about the topic.",
      length: "About 1 min · 150 words",
    });
  });

  it("says nothing of length when the text names no word count", () => {
    expect(promptGist("Explain {{Slopify_Summary}} simply")).toEqual({
      sentence: "Explain the summary simply",
      length: undefined,
    });
  });
});

describe("the article prompt cards", () => {
  const prompts = [
    prompt(
      "History · Documentary",
      "Write a documentary narration about {{Topic}}.\n2000-2400 words",
    ),
    prompt("Sleep lore · Story", "Write a bedtime telling of {{Topic}}."),
    prompt("Hooks", "Pick the boldest claims.", "shorts"),
  ];

  it("offers each prompt of the kind as a card with what it writes, and shows the picked one's text", async () => {
    const onPick = vi.fn();
    function Subject() {
      const [value, setValue] = useState("");
      return (
        <PromptCards
          field="articlePrompt"
          label="Article prompt"
          kind="article"
          prompts={prompts}
          value={value}
          problem={value === "" ? "Pick an article prompt." : undefined}
          onPick={(next) => {
            onPick(next);
            setValue(next);
          }}
        />
      );
    }
    renderRouted(<Subject />, testDeps({}));
    const group = await screen.findByRole("radiogroup", { name: "Article prompt" });
    expect(group.getAttribute("aria-invalid")).toBe("true");
    const cards = within(group).getAllByRole("radio");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.closest("label")?.textContent).toBe(
      "History · DocumentaryWrite a documentary narration about the topic.About 15 min · 2000-2400 words",
    );
    // A refusal focuses the first card while none is picked.
    expect(cards[0]?.getAttribute("data-play-field")).toBe("articlePrompt");
    expect(screen.getByText("Pick an article prompt.")).not.toBeNull();
    expect(screen.queryByText("Text of the prompt")).toBeNull();
    await userEvent.click(within(group).getByRole("radio", { name: /^Sleep lore · Story/ }));
    expect(onPick).toHaveBeenCalledWith("Sleep lore · Story");
    expect(group.getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByText("Text of the prompt")).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "New prompt ↗ (opens Prompts)" }).getAttribute("href"),
    ).toBe("/prompts/new?kind=article");
  });

  it("keeps a picked prompt that is no longer in Prompts, saying so", async () => {
    renderRouted(
      <PromptCards
        field="articlePrompt"
        label="Article prompt"
        kind="article"
        prompts={prompts}
        value="Gone"
        problem={undefined}
        onPick={() => {}}
      />,
      testDeps({}),
    );
    const gone = await screen.findByRole<HTMLInputElement>("radio", { name: /^Gone/ });
    expect(gone.checked).toBe(true);
    expect(gone.closest("label")?.textContent).toContain("no longer in Prompts");
  });

  it("says what a prompt is when there are none of the kind yet", async () => {
    renderRouted(
      <PromptCards
        field="articlePrompt"
        label="Script prompt"
        kind="script"
        prompts={prompts}
        value=""
        problem={undefined}
        onPick={() => {}}
      />,
      testDeps({}),
    );
    expect(
      await screen.findByText(/No script prompts yet\. A prompt tells the AI what to write\./),
    ).not.toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
