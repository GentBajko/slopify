import type { Prompt } from "@app/slices/library/model.js";
import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { ImageScenesControl } from "./image-scenes";

afterEach(cleanup);

function prompt(kind: Prompt["kind"], name: string, body: string): Prompt {
  return { id: name, kind, name, body, slots: [], updatedAt: "2026-09-03T00:00:00.000Z" };
}

const prompts = [
  prompt("image", "Oils", "Oil painting, {{Slopify_Mood}} light"),
  prompt("image", "Plain", "A plain picture, {{Scene}}"),
  prompt("thumbnail", "Card", "A card"),
];

function documentWith(imageScenes: boolean): PlayDraftDocument {
  const document = freshDraftDocument;
  return {
    ...document,
    form: {
      ...document.form,
      sources: { ...document.form.sources, article: "generate", images: "generate" },
      imagePrompts: [
        { name: "Oils", number: "2" },
        { name: "Plain", number: "1" },
      ],
      thumbnailPrompt: "Card",
      ...(imageScenes ? { imageScenes: true } : {}),
    },
  };
}

describe("Play's Scenes from the article", () => {
  it("says a picked prompt using a scene keyword gets its scene with the switch off", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<ImageScenesControl document={documentWith(false)} prompts={prompts} onEdit={onEdit} />);
    const row = screen.getByRole("switch", { name: 'On for "Oils": it uses {{Slopify_Mood}}' });
    expect(row.getAttribute("aria-checked")).toBe("true");
    await user.click(row);
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("switch", { name: /Plain/ })).toBeNull();
    expect(screen.queryByRole("switch", { name: /thumbnail/ })).toBeNull();
  });

  it("says nothing more once the switch is on", () => {
    render(<ImageScenesControl document={documentWith(true)} prompts={prompts} onEdit={vi.fn()} />);
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });
});
