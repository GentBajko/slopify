import type { Entry, EntryDraft } from "@app/slices/library/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPaletteProvider } from "@/components/kit/command-palette";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, renderRouted, testDeps, testVersion } from "@/test-app";
import { EntryEditorRoute } from "./entry-editor.js";

afterEach(cleanup);

const coldOpen: Entry = {
  id: "e1",
  category: "intro",
  mode: "text",
  name: "Cold open",
  body: "Today on the channel: {{topic}}.",
  slots: ["topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

// The refusals `edge/http/entries.ts` writes, which are the prompt routes' own mapping: RFC
// 9457 with the `fields` extension member.
function refusalAnswer(status: number, detail: string, fields: readonly unknown[]): Answer {
  return () =>
    new Response(JSON.stringify({ title: "Refused", status, detail, fields }), {
      status,
      headers: { "content-type": "application/problem+json", "X-Slopify-Version": testVersion },
    });
}

function deps(entries: readonly Entry[], extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({ "GET /api/entries": jsonAnswer({ entries }), ...extra });
}

function saveSpy(taken: readonly Entry[]) {
  const sent: EntryDraft[] = [];
  const answer: Answer = async (request) => {
    const draft = (await request.json()) as EntryDraft;
    sent.push(draft);
    // A name is taken within its category only, compared case-insensitively, and
    // the unique index is what decides, so the answer is a 409 marking the field.
    const clash = taken.some(
      (entry) =>
        entry.category === draft.category &&
        entry.name.toLowerCase() === draft.name.trim().toLowerCase(),
    );
    return clash
      ? refusalAnswer(409, "Another entry already has this name.", [
          { field: "name", message: "Another entry already has this name." },
        ])(request)
      : jsonAnswer({ ...coldOpen, ...draft, id: "new", slots: [] }, 201)(request);
  };
  return { sent, answer };
}

// `{` opens a key descriptor in user-event, and a body is mostly braces, so a body is
// pasted into the focused field instead of typed. React sees the same change event.
async function fill(user: UserEvent, label: string | RegExp, text: string): Promise<void> {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.click(field);
  await user.paste(text);
}

// The text box is named for what the narrator reads: the words, or the AI's instructions.
const body = /^(Words to say|Instructions for the AI)$/u;
const bodyBox = () => screen.getByLabelText(body) as HTMLTextAreaElement;
const outro = { name: "Outro, after the video" } as const;
const intro = { name: "Intro, before the video" } as const;
const words = { name: "Say these exact words" } as const;
const ai = { name: "Let the AI write it from these instructions" } as const;

async function newEditor(extra: Readonly<Record<string, Answer>> = {}, onLeave = vi.fn()) {
  const rendered = renderRouted(
    <EntryEditorRoute entryId={undefined} category="intro" from={undefined} onLeave={onLeave} />,
    deps([], extra),
  );
  await screen.findByLabelText("Name");
  return { ...rendered, onLeave };
}

describe("the intro and outro editor's two choices", () => {
  it("saves the category and the mode that are on", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([]);
    const { onLeave } = await newEditor({ "POST /api/entries": spy.answer });

    await user.type(screen.getByLabelText("Name"), "Sign-off");
    await fill(user, body, "Thanks for watching.");
    await user.click(screen.getByRole("radio", outro));
    await user.click(screen.getByRole("radio", ai));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(spy.sent).toEqual([
        { category: "outro", mode: "llm", name: "Sign-off", body: "Thanks for watching." },
      ]);
    });
    expect(await screen.findByText("Saved")).not.toBeNull();
    await waitFor(
      () => {
        expect(onLeave).toHaveBeenCalledWith("outro");
      },
      { timeout: 4000 },
    );
  });

  it("saves on Ctrl+S from inside a field, as the Save button does", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([]);
    renderRouted(
      <CommandPaletteProvider>
        <EntryEditorRoute entryId={undefined} category="intro" from={undefined} onLeave={vi.fn()} />
      </CommandPaletteProvider>,
      deps([], { "POST /api/entries": spy.answer }),
    );
    await screen.findByLabelText("Name");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-keyshortcuts")).toBe(
      "Control+S Meta+S",
    );
    await user.type(screen.getByLabelText("Name"), "Sign-off");
    await fill(user, body, "Thanks for watching.");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => {
      expect(spy.sent).toHaveLength(1);
    });
  });

  it("opens on the category the tab was on, and on Text", async () => {
    const spy = saveSpy([]);
    const user = userEvent.setup();
    await newEditor({ "POST /api/entries": spy.answer });

    expect(screen.getByRole("radio", intro).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", words).getAttribute("aria-checked")).toBe("true");

    await user.type(screen.getByLabelText("Name"), "Cold open");
    await fill(user, body, "Today on the channel.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(spy.sent[0]).toEqual({
        category: "intro",
        mode: "text",
        name: "Cold open",
        body: "Today on the channel.",
      });
    });
  });
});

describe("what the narrator reads", () => {
  // Exact words are narrated as they stand; instructions are run by the article stage and the
  // answer is what gets narrated.
  it("says what each choice does, and names the text box for it", async () => {
    const user = userEvent.setup();
    await newEditor();

    expect(screen.getByRole("heading", { level: 1, name: "New intro" })).not.toBeNull();
    const mode = screen.getByRole("radiogroup", { name: "What the narrator reads" });
    const said = () => document.getElementById(mode.getAttribute("aria-describedby") ?? "");
    expect(said()?.textContent).toBe("Narrated exactly as written, with the keywords filled in.");
    expect(screen.getByLabelText("Words to say")).not.toBeNull();

    await user.click(screen.getByRole("radio", ai));
    expect(said()?.textContent).toBe(
      "The AI writes the intro from these instructions, then it is narrated: one AI call per video.",
    );
    expect(screen.getByLabelText("Instructions for the AI")).not.toBeNull();
  });

  it("says what a text with no keywords does, in the choice's own words", async () => {
    const user = userEvent.setup();
    await newEditor();

    await fill(user, body, "Thanks for watching.");
    expect(screen.getByText("It asks you for nothing: it is narrated as written.")).not.toBeNull();

    await user.click(screen.getByRole("radio", ai));
    expect(
      screen.getByText("It asks you for nothing: the AI gets these instructions as written."),
    ).not.toBeNull();
  });
});

describe("the intro and outro editor's keywords", () => {
  it("lists an AI-written one's keywords as chips, exactly as a prompt's", async () => {
    const user = userEvent.setup();
    await newEditor();

    expect(
      screen.getByText(
        "Type {{Topic}} where the video's subject goes. Each keyword becomes a question on Create.",
      ),
    ).not.toBeNull();

    await user.click(screen.getByRole("radio", ai));
    await fill(user, body, "Write a sign-off about {{topic}} for {{channel}}.");
    expect(screen.getByText("topic").getAttribute("data-slot-chip")).toBe("topic");
    expect(screen.getByText("channel").getAttribute("data-slot-chip")).toBe("channel");
  });

  // A text-mode entry is stored as rendered, and the fields of the picked intro and outro
  // are collected whatever their mode, so a narrated body carries slots too.
  it("lists the keywords of exact words as well, because those are filled in too", async () => {
    const user = userEvent.setup();
    await newEditor();

    await fill(user, body, "Today on the channel: {{topic}}.");
    expect(screen.getByRole("radio", words).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("topic").getAttribute("data-slot-chip")).toBe("topic");
  });

  it("holds Save on a malformed keyword with the server's own sentence, in either mode", async () => {
    const user = userEvent.setup();
    const { container } = await newEditor();

    await user.type(screen.getByLabelText("Name"), "Cold open");
    await fill(user, body, "Line one.\nThen {{bad");

    const marks = container.querySelectorAll("[data-lint-mark]");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute("data-lint-mark")).toBe("15");
    expect(screen.getByText("1 keyword error")).not.toBeNull();
    // Once in the slots panel, once beside the Save it is holding.
    expect(
      screen.getAllByText(
        "The `{{` at line 2, column 6 is never closed. Add `}}` after the keyword name.",
      ),
    ).toHaveLength(2);
    expect(bodyBox().getAttribute("aria-invalid")).toBe("true");

    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(save.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe(
      "The `{{` at line 2, column 6 is never closed. Add `}}` after the keyword name.",
    );

    await user.click(screen.getByRole("radio", ai));
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getAllByText(
        "The `{{` at line 2, column 6 is never closed. Add `}}` after the keyword name.",
      ),
    ).toHaveLength(2);

    await fill(user, body, "Line one.\nThen {{good}}");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("says nothing on arrival, then once Save is pressed holds for a name, then for the text", async () => {
    const user = userEvent.setup();
    await newEditor();

    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("aria-disabled")).toBe("false");
    expect(screen.queryByText("Enter a name.")).toBeNull();

    await user.click(save);
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getAllByText("Enter a name.")).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));

    await user.type(screen.getByLabelText("Name"), "Cold open");
    expect(screen.getByText("Enter the text.")).not.toBeNull();
  });
});

describe("a name another entry already has", () => {
  it("marks the Name field with the server's sentence and holds Save", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([coldOpen]);
    await newEditor({ "POST /api/entries": spy.answer });

    await user.type(screen.getByLabelText("Name"), "cold OPEN");
    await fill(user, body, "Anything.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const name = screen.getByLabelText("Name");
    await waitFor(() => {
      expect(name.getAttribute("aria-invalid")).toBe("true");
    });
    const described = document.getElementById(name.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe("Another entry already has this name.");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");

    // The refusal stands until the field it names changes.
    await user.type(name, " two");
    // A valid field carries no aria-invalid at all (the kit Field sets it only with an error).
    expect(name.getAttribute("aria-invalid")).toBeNull();
  });

  it("takes the same name as an outro, because the categories are counted apart", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([coldOpen]);
    await newEditor({ "POST /api/entries": spy.answer });

    await user.type(screen.getByLabelText("Name"), "Cold open");
    await fill(user, body, "Anything.");
    await user.click(screen.getByRole("radio", outro));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).not.toBeNull();
    expect(spy.sent).toEqual([
      { category: "outro", mode: "text", name: "Cold open", body: "Anything." },
    ]);
    expect(screen.queryByText("Another entry already has this name.")).toBeNull();
  });
});

describe("an existing entry", () => {
  it("opens filled on its own category and mode, and offers Delete", async () => {
    const user = userEvent.setup();
    const sent: string[] = [];
    const onLeave = vi.fn();
    renderRouted(
      <EntryEditorRoute entryId="e1" category="outro" from={undefined} onLeave={onLeave} />,
      deps([coldOpen], {
        "DELETE /api/entries/e1": (request) => {
          sent.push(new URL(request.url).pathname);
          return emptyAnswer()(request);
        },
      }),
    );

    const name = await screen.findByLabelText("Name");
    expect((name as HTMLInputElement).value).toBe("Cold open");
    expect(bodyBox().value).toBe("Today on the channel: {{topic}}.");
    // The row it loaded carries the category, whatever tab the link came from.
    expect(screen.getByRole("radio", intro).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", words).getAttribute("aria-checked")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.",
      ),
    ).not.toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Delete intro" }));

    await waitFor(() => {
      expect(sent).toEqual(["/api/entries/e1"]);
    });
    expect(onLeave).toHaveBeenCalledWith("intro");
  });

  it("says so when the entry is no longer there", async () => {
    renderRouted(
      <EntryEditorRoute entryId="gone" category="intro" from={undefined} onLeave={vi.fn()} />,
      deps([coldOpen]),
    );

    expect(
      await screen.findByText("That intro is gone. It may have been deleted in another tab."),
    ).not.toBeNull();
  });

  it("opens a duplicate as a copy the user renames before saving", async () => {
    renderRouted(
      <EntryEditorRoute entryId={undefined} category="intro" from="e1" onLeave={vi.fn()} />,
      deps([coldOpen]),
    );

    const name = await screen.findByLabelText("Name");
    expect((name as HTMLInputElement).value).toBe("Cold open copy");
    expect(bodyBox().value).toBe("Today on the channel: {{topic}}.");
  });

  it("says what went wrong when the list cannot be read", async () => {
    renderRouted(
      <EntryEditorRoute entryId="e1" category="intro" from={undefined} onLeave={vi.fn()} />,
      testDeps({ "GET /api/entries": () => new Response(null, { status: 500 }) }),
    );

    expect(await screen.findByText(/unexpected error \(500\)/)).not.toBeNull();
  });
});

describe("the entry editor's keywords Slopify fills", () => {
  it("offers the keywords an intro can use above the text and puts one at the caret", async () => {
    const user = userEvent.setup();
    await newEditor();
    const bar = screen.getByRole("toolbar", { name: "Insert a keyword Slopify fills" });
    expect(within(bar).queryByRole("button", { name: "Insert Scene" })).toBeNull();
    await fill(user, body, "Welcome to .");
    const box = bodyBox() as HTMLTextAreaElement;
    box.setSelectionRange(11, 11);
    await user.click(within(bar).getByRole("button", { name: "Insert Channel" }));
    expect(box.value).toBe("Welcome to {{Slopify_Channel}}.");
  });
});
