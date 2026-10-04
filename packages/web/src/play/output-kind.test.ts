import { describe, expect, it } from "vitest";
import { articleTaskOf, articleTaskPatch, spokenText } from "./article-task";
import { outputKindOf, outputKindPatch, rowShown } from "./output-kind";
import { freshForm, type PlayFormState } from "./state";
import { samplePassage } from "./voice-sample";

const apply = (form: PlayFormState, patch: Partial<PlayFormState>): PlayFormState => ({
  ...form,
  ...patch,
});

describe("what the person is making", () => {
  it("reads a fresh draft as a video, and each choice back as itself", () => {
    expect(outputKindOf(freshForm)).toBe("video");
    for (const kind of ["video", "article", "audiobook", "podcast", "images"] as const)
      expect(outputKindOf(apply(freshForm, outputKindPatch(freshForm, kind)))).toBe(kind);
  });

  it("turns off what standalone work does not need, and keeps a provided source", () => {
    const supplied = apply(freshForm, {
      sources: { ...freshForm.sources, article: "provide" },
      youtubeDescription: true,
    });
    const book = apply(supplied, outputKindPatch(supplied, "audiobook"));
    expect(book.sources).toMatchObject({
      article: "provide",
      audio: "generate",
      images: "off",
      video: "off",
      thumbnail: "off",
    });
    // No channel, YouTube step or image provider is asked for an audiobook.
    expect(book.youtubeDescription).toBe(false);
    const pictures = apply(freshForm, outputKindPatch(freshForm, "images"));
    expect(pictures.sources).toMatchObject({ article: "off", audio: "off", images: "generate" });
  });

  it("gives a podcast two speakers, and an audiobook one narrator again", () => {
    const podcast = apply(freshForm, outputKindPatch(freshForm, "podcast"));
    expect(podcast.voices?.format).toBe("podcast");
    expect(podcast.voices?.speakers).toHaveLength(2);
    const book = apply(podcast, outputKindPatch(podcast, "audiobook"));
    expect(book.voices).toBeUndefined();
  });

  it("shows only the rows the work needs, plus any that need attention or are open", () => {
    expect(rowShown("images", "article", { problem: false, open: false })).toBe(false);
    expect(rowShown("narration", "images", { problem: false, open: false })).toBe(false);
    expect(rowShown("narration", "images", { problem: true, open: false })).toBe(true);
    expect(rowShown("images", "article", { problem: false, open: true })).toBe(true);
    expect(rowShown("video", "audiobook", { problem: false, open: false })).toBe(true);
  });
});

describe("supplied text", () => {
  it("says where the text comes from as the task", () => {
    expect(articleTaskOf(freshForm)).toBe("write");
    const asWritten = apply(freshForm, articleTaskPatch(freshForm, "as-written"));
    expect(asWritten.sources.article).toBe("provide");
    const typed = apply(asWritten, {
      provided: { ...asWritten.provided, article: "My own chapter." },
    });
    const adapted = apply(typed, articleTaskPatch(typed, "adapt"));
    expect(articleTaskOf(adapted)).toBe("adapt");
    // What was pasted to be read as written is what gets adapted.
    expect(adapted.provided.research).toBe("My own chapter.");
    expect(articleTaskOf(apply(adapted, articleTaskPatch(adapted, "write")))).toBe("write");
    expect(articleTaskOf(apply(freshForm, articleTaskPatch(freshForm, "none")))).toBe("none");
  });

  it("shows the spoken text with aliases and without the glossary", () => {
    const spoken = spokenText(
      "Dr. Arda spoke.\n\n## Pronunciation Glossary\n\n| Term | IPA |\n|---|---|\n| Arda | /ˈɑɹdə/ |\n",
      [{ written: "Dr.", spoken: "Doctor", caseSensitive: false, wholeWord: true }],
    );
    expect(spoken.text).toContain("Doctor Arda spoke.");
    expect(spoken.text).not.toContain("ˈɑɹdə");
    expect(spoken.glossary).toBe(true);
  });

  it("samples the first sentences that fit one audition", () => {
    const text = `${"One sentence here. ".repeat(30)}`;
    const passage = samplePassage(text, 100);
    expect(passage.length).toBeLessThanOrEqual(100);
    expect(passage.endsWith(".")).toBe(true);
  });
});
