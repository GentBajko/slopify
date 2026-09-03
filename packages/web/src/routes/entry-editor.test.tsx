import type { Entry, EntryDraft } from "@app/slices/library/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

// The refusals `edge/http/entries.ts` writes, which are the prompt routes' own mapping
// (`logic/15` §Q121): RFC 9457 with the `fields` extension member.
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
    // §Q122: a name is taken within its category only, compared case-insensitively, and
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
async function fill(user: UserEvent, label: string, text: string): Promise<void> {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.click(field);
  await user.paste(text);
}

async function newEditor(extra: Readonly<Record<string, Answer>> = {}, onLeave = vi.fn()) {
  const rendered = renderRouted(
    <EntryEditorRoute entryId={undefined} category="intro" from={undefined} onLeave={onLeave} />,
    deps([], extra),
  );
  await screen.findByLabelText("Name");
  return { ...rendered, onLeave };
}

describe("the entry editor's two switches", () => {
  it("saves the category and the mode that are on", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([]);
    const { onLeave } = await newEditor({ "POST /api/entries": spy.answer });

    await user.type(screen.getByLabelText("Name"), "Sign-off");
    await fill(user, "Body", "Thanks for watching.");
    await user.click(screen.getByRole("radio", { name: "Outro" }));
    await user.click(screen.getByRole("radio", { name: "LLM" }));
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

  it("opens on the category the tab was on, and on Text", async () => {
    const spy = saveSpy([]);
    const user = userEvent.setup();
    await newEditor({ "POST /api/entries": spy.answer });

    expect(screen.getByRole("radio", { name: "Intro" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Text" }).getAttribute("aria-checked")).toBe("true");

    await user.type(screen.getByLabelText("Name"), "Cold open");
    await fill(user, "Body", "Today on the channel.");
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

describe("what the mode asks of the body", () => {
  // `logic/07` step 5: a text-mode entry is narrated as it stands, an LLM-mode one is an
  // instruction the article stage runs and the answer is what gets narrated.
  it("says what the body is for, and says something else in the other mode", async () => {
    const user = userEvent.setup();
    await newEditor();

    const mode = screen.getByRole("radiogroup", { name: "Mode" });
    const said = () => document.getElementById(mode.getAttribute("aria-describedby") ?? "");
    expect(said()?.textContent).toBe("Text is narrated as written.");

    await user.click(screen.getByRole("radio", { name: "LLM" }));
    expect(said()?.textContent).toBe("LLM is an instruction whose answer is narrated.");
  });

  it("says what a body with no slots does, in the mode's own words", async () => {
    const user = userEvent.setup();
    await newEditor();

    await fill(user, "Body", "Thanks for watching.");
    expect(screen.getByText("No slots. This text is narrated as written.")).not.toBeNull();

    await user.click(screen.getByRole("radio", { name: "LLM" }));
    expect(screen.getByText("No slots. This instruction runs as written.")).not.toBeNull();
  });
});

describe("the entry editor's slots", () => {
  it("lists an LLM body's slots as chips, exactly as a prompt's", async () => {
    const user = userEvent.setup();
    await newEditor();

    expect(screen.getByText("Slots appear here as you type {{name}}.")).not.toBeNull();

    await user.click(screen.getByRole("radio", { name: "LLM" }));
    await fill(user, "Body", "Write a sign-off about {{topic}} for {{channel}}.");
    expect(screen.getByText("topic").getAttribute("data-slot-chip")).toBe("topic");
    expect(screen.getByText("channel").getAttribute("data-slot-chip")).toBe("channel");
  });

  // `logic/07` step 5 stores a text-mode entry "as rendered per scenario 03", and
  // `logic/03` step 3 collects the fields of the picked intro and outro whatever their
  // mode, so a narrated body carries slots too.
  it("lists a text body's slots as well, because a text entry is rendered too", async () => {
    const user = userEvent.setup();
    await newEditor();

    await fill(user, "Body", "Today on the channel: {{topic}}.");
    expect(screen.getByRole("radio", { name: "Text" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("topic").getAttribute("data-slot-chip")).toBe("topic");
  });

  it("holds Save on a malformed slot with the server's own sentence, in either mode", async () => {
    const user = userEvent.setup();
    const { container } = await newEditor();

    await user.type(screen.getByLabelText("Name"), "Cold open");
    await fill(user, "Body", "Line one.\nThen {{bad");

    const marks = container.querySelectorAll("[data-lint-mark]");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute("data-lint-mark")).toBe("15");
    expect(screen.getByText("1 slot error")).not.toBeNull();
    // Once in the slots panel, once beside the Save it is holding.
    expect(screen.getAllByText("The `{{` at line 2, column 6 is never closed.")).toHaveLength(2);
    expect(screen.getByLabelText("Body").getAttribute("aria-invalid")).toBe("true");

    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(save.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("The `{{` at line 2, column 6 is never closed.");

    await user.click(screen.getByRole("radio", { name: "LLM" }));
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getAllByText("The `{{` at line 2, column 6 is never closed.")).toHaveLength(2);

    await fill(user, "Body", "Line one.\nThen {{good}}");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("holds until there is a name, then until there is a body", async () => {
    const user = userEvent.setup();
    await newEditor();

    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("A name is required.")).not.toBeNull();

    await user.type(screen.getByLabelText("Name"), "Cold open");
    expect(screen.getByText("A body is required.")).not.toBeNull();
  });
});

describe("a name another entry already has", () => {
  it("marks the Name field with the server's sentence and holds Save", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([coldOpen]);
    await newEditor({ "POST /api/entries": spy.answer });

    await user.type(screen.getByLabelText("Name"), "cold OPEN");
    await fill(user, "Body", "Anything.");
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
    expect(name.getAttribute("aria-invalid")).toBe("false");
  });

  it("takes the same name as an outro, because the categories are counted apart", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([coldOpen]);
    await newEditor({ "POST /api/entries": spy.answer });

    await user.type(screen.getByLabelText("Name"), "Cold open");
    await fill(user, "Body", "Anything.");
    await user.click(screen.getByRole("radio", { name: "Outro" }));
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
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe(
      "Today on the channel: {{topic}}.",
    );
    // The row it loaded carries the category, whatever tab the link came from.
    expect(screen.getByRole("radio", { name: "Intro" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Text" }).getAttribute("aria-checked")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Projects that used it keep their text.")).not.toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

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
      await screen.findByText("That entry is gone. It may have been deleted in another tab."),
    ).not.toBeNull();
  });

  it("opens a duplicate as a copy the user renames before saving", async () => {
    renderRouted(
      <EntryEditorRoute entryId={undefined} category="intro" from="e1" onLeave={vi.fn()} />,
      deps([coldOpen]),
    );

    const name = await screen.findByLabelText("Name");
    expect((name as HTMLInputElement).value).toBe("Cold open copy");
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe(
      "Today on the channel: {{topic}}.",
    );
  });

  it("says what went wrong when the list cannot be read", async () => {
    renderRouted(
      <EntryEditorRoute entryId="e1" category="intro" from={undefined} onLeave={vi.fn()} />,
      testDeps({ "GET /api/entries": () => new Response(null, { status: 500 }) }),
    );

    expect(await screen.findByText(/answered 500/)).not.toBeNull();
  });
});
