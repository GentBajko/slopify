import type { Prompt, PromptDraft } from "@app/slices/library/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, renderRouted, testDeps, testVersion } from "@/test-app";
import { PromptEditorRoute } from "./prompt-editor.js";

afterEach(cleanup);

const dossier: Prompt = {
  id: "p1",
  kind: "article",
  name: "Documentary dossier",
  body: "Compose a dossier on {{topic}}.",
  slots: ["topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

// The refusals `edge/http/prompts.ts` writes: RFC 9457 with the `fields` extension member
// naming what is wrong and where.
function refusalAnswer(status: number, detail: string, fields: readonly unknown[]): Answer {
  return () =>
    new Response(JSON.stringify({ title: "Refused", status, detail, fields }), {
      status,
      headers: { "content-type": "application/problem+json", "X-Slopify-Version": testVersion },
    });
}

function deps(prompts: readonly Prompt[], extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({ "GET /api/prompts": jsonAnswer({ prompts }), ...extra });
}

function saveSpy(taken: readonly Prompt[]) {
  const sent: PromptDraft[] = [];
  const answer: Answer = async (request) => {
    const draft = (await request.json()) as PromptDraft;
    sent.push(draft);
    const clash = taken.some(
      (prompt) =>
        prompt.kind === draft.kind && prompt.name.toLowerCase() === draft.name.trim().toLowerCase(),
    );
    // Names are unique per kind, compared case-insensitively, and the index is what
    // decides, so the answer is a 409 marking the field.
    return clash
      ? refusalAnswer(409, "Another prompt already has this name.", [
          { field: "name", message: "Another prompt already has this name." },
        ])(request)
      : jsonAnswer({ ...dossier, ...draft, id: "new", slots: [] }, 201)(request);
  };
  return { sent, answer };
}

// `{` opens a key descriptor in user-event, and a prompt body is mostly braces, so a body
// is pasted into the focused field instead of typed. React sees the same change event.
async function fill(user: UserEvent, label: string, text: string): Promise<void> {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.click(field);
  await user.paste(text);
}

// The first paint under a router is asynchronous, so opening the editor waits for it.
async function newEditor(extra: Readonly<Record<string, Answer>> = {}, onLeave = vi.fn()) {
  const rendered = renderRouted(
    <PromptEditorRoute promptId={undefined} kind="article" from={undefined} onLeave={onLeave} />,
    deps([], extra),
  );
  await screen.findByLabelText("Name");
  return { ...rendered, onLeave };
}

describe("the prompt editor's slots panel", () => {
  it("invites the first slot, then lists what the body holds as chips", async () => {
    const user = userEvent.setup();
    await newEditor();

    expect(screen.getByText("Slots appear here as you type {{name}}.")).not.toBeNull();

    await fill(user, "Body", "About {{topic}} in {{era}}.");
    expect(screen.getByText("topic").getAttribute("data-slot-chip")).toBe("topic");
    expect(screen.getByText("era").getAttribute("data-slot-chip")).toBe("era");
  });

  it("says a body without slots runs as written", async () => {
    const user = userEvent.setup();
    await newEditor();

    await fill(user, "Body", "No slots at all.");
    expect(screen.getByText("No slots. This prompt runs as written.")).not.toBeNull();
  });
});

describe("the prompt editor's lint", () => {
  it("marks the offending opener where it stands and names its line and column", async () => {
    const user = userEvent.setup();
    const { container } = await newEditor();

    // The `{{` is the 16th character of the body: line 2, column 6.
    await fill(user, "Body", "Line one.\nThen {{bad");

    const marks = container.querySelectorAll("[data-lint-mark]");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("{{");
    expect(marks[0]?.getAttribute("data-lint-mark")).toBe("15");
    expect(screen.getByText("1 slot error")).not.toBeNull();
    expect(screen.getByText("The `{{` at line 2, column 6 is never closed.")).not.toBeNull();
    expect(screen.getByLabelText("Body").getAttribute("aria-invalid")).toBe("true");
  });

  it("marks an empty slot and a nested one, and counts them", async () => {
    const user = userEvent.setup();
    const { container } = await newEditor();

    await fill(user, "Body", "{{}} and {{a{b}}");
    expect(container.querySelectorAll("[data-lint-mark]")).toHaveLength(2);
    expect(screen.getByText("2 slot errors")).not.toBeNull();
    expect(screen.getByText("The slot at line 1, column 1 has no name.")).not.toBeNull();
    expect(
      screen.getByText("The slot at line 1, column 10 holds a brace; slots do not nest."),
    ).not.toBeNull();
  });

  it("leaves a well-formed body unmarked", async () => {
    const user = userEvent.setup();
    const { container } = await newEditor();

    await fill(user, "Body", "About {{topic}}.");
    expect(container.querySelectorAll("[data-lint-mark]")).toHaveLength(0);
    expect(screen.queryByText("1 slot error")).toBeNull();
  });
});

describe("the prompt editor's Save", () => {
  it("holds until there is a name, and names the missing name first", async () => {
    const user = userEvent.setup();
    await newEditor();

    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("A name is required.")).not.toBeNull();

    // A malformed body does not change which problem is first: the name still is.
    await fill(user, "Body", "About {{bad");
    expect(screen.getByText("A name is required.")).not.toBeNull();
  });

  it("names the missing body once the name is there", async () => {
    const user = userEvent.setup();
    await newEditor();

    await user.type(screen.getByLabelText("Name"), "Dossier");
    expect(screen.getByText("A body is required.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("names the slot error, and points the button at the sentence", async () => {
    const user = userEvent.setup();
    await newEditor();

    await user.type(screen.getByLabelText("Name"), "Dossier");
    await fill(user, "Body", "About {{bad");

    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(save.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("The `{{` at line 1, column 7 is never closed.");
  });

  it("lets go once the body is fixed, and posts what was typed", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([]);
    const { onLeave } = await newEditor({ "POST /api/prompts": spy.answer });

    await user.type(screen.getByLabelText("Name"), "Dossier");
    await fill(user, "Body", "About {{bad");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");

    await fill(user, "Body", "About {{bad}}");

    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("aria-disabled")).toBe("false");
    expect(save.hasAttribute("aria-describedby")).toBe(false);

    await user.click(save);
    await waitFor(() => {
      expect(spy.sent).toEqual([{ kind: "article", name: "Dossier", body: "About {{bad}}" }]);
    });
    expect(await screen.findByText("Saved")).not.toBeNull();
    await waitFor(
      () => {
        expect(onLeave).toHaveBeenCalledWith("article");
      },
      { timeout: 4000 },
    );
  });
});

describe("a name another prompt already has", () => {
  it("marks the Name field with the server's sentence and holds Save", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([dossier]);
    await newEditor({ "POST /api/prompts": spy.answer });

    await user.type(screen.getByLabelText("Name"), "documentary DOSSIER");
    await fill(user, "Body", "Anything.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const name = screen.getByLabelText("Name");
    await waitFor(() => {
      expect(name.getAttribute("aria-invalid")).toBe("true");
    });
    const described = document.getElementById(name.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe("Another prompt already has this name.");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");

    // The refusal stands until the field it names changes.
    await user.type(name, " two");
    expect(name.getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("takes the same name under another kind, because a name is only taken within one", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([dossier]);
    await newEditor({ "POST /api/prompts": spy.answer });

    await user.type(screen.getByLabelText("Name"), "Documentary dossier");
    await fill(user, "Body", "Anything.");
    await user.click(screen.getByRole("radio", { name: "Image" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).not.toBeNull();
    expect(spy.sent).toEqual([{ kind: "image", name: "Documentary dossier", body: "Anything." }]);
    expect(screen.queryByText("Another prompt already has this name.")).toBeNull();
  });
});

describe("an existing prompt", () => {
  it("opens filled, saves over itself and offers Delete", async () => {
    const user = userEvent.setup();
    const sent: string[] = [];
    const onLeave = vi.fn();
    renderRouted(
      <PromptEditorRoute promptId="p1" kind="article" from={undefined} onLeave={onLeave} />,
      deps([dossier], {
        "DELETE /api/prompts/p1": (request) => {
          sent.push(new URL(request.url).pathname);
          return emptyAnswer()(request);
        },
      }),
    );

    const name = await screen.findByLabelText("Name");
    expect((name as HTMLInputElement).value).toBe("Documentary dossier");
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe(
      "Compose a dossier on {{topic}}.",
    );
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe(
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Projects that used it keep their text.")).not.toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(sent).toEqual(["/api/prompts/p1"]);
    });
    expect(onLeave).toHaveBeenCalledWith("article");
  });

  it("says so when the prompt is no longer there", async () => {
    renderRouted(
      <PromptEditorRoute promptId="gone" kind="article" from={undefined} onLeave={vi.fn()} />,
      deps([dossier]),
    );

    expect(
      await screen.findByText("That prompt is gone. It may have been deleted in another tab."),
    ).not.toBeNull();
  });

  it("opens a duplicate as a copy the user renames before saving", async () => {
    renderRouted(
      <PromptEditorRoute promptId={undefined} kind="article" from="p1" onLeave={vi.fn()} />,
      deps([dossier]),
    );

    const name = await screen.findByLabelText("Name");
    expect((name as HTMLInputElement).value).toBe("Documentary dossier copy");
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe(
      "Compose a dossier on {{topic}}.",
    );
  });
});
