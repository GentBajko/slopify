import type { Prompt, PromptDraft } from "@app/slices/library/model.js";
import { defaultDescriptionPrompt } from "@app/slices/youtube/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { narrationStarter } from "@/lib/narration-starter";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, renderRouted, testDeps, testVersion } from "@/test-app";
import { PromptEditorRoute } from "./prompt-editor.js";

const tutorial = vi.hoisted(() => ({
  event: vi.fn(),
  progress: vi.fn<(progress: Readonly<Record<string, boolean>>) => void>(),
}));

vi.mock("@/tutorial/context", () => ({
  useTutorialEvent: () => tutorial.event,
  useTutorialProgress: tutorial.progress,
}));

afterEach(() => {
  cleanup();
  tutorial.event.mockClear();
  tutorial.progress.mockClear();
});

it("offers the narration starter as an example, without saving or silently replacing a draft", async () => {
  const user = userEvent.setup();
  const spy = saveSpy([]);
  renderRouted(
    <PromptEditorRoute promptId={undefined} kind="narration" from={undefined} onLeave={vi.fn()} />,
    deps([], { "POST /api/prompts": spy.answer }),
  );
  await screen.findByLabelText("Name");
  const pick = async () => {
    await user.click(screen.getByRole("button", { name: "Start from an example" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Documentary delivery (built in)" }),
    );
  };
  await pick();
  expect(body().value).toBe(narrationStarter);
  expect(spy.sent).toEqual([]);
  await fill(user, "Instructions", "My detailed delivery prompt.");
  await pick();
  const dialog = await screen.findByRole("dialog");
  expect(body().value).toBe("My detailed delivery prompt.");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(body().value).toBe("My detailed delivery prompt.");
  await pick();
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Replace the text" }),
  );
  expect(body().value).toBe(narrationStarter);
  expect(spy.sent).toEqual([]);
});

it("starts a YouTube description prompt from the built-in wording", async () => {
  const user = userEvent.setup();
  renderRouted(
    <PromptEditorRoute
      promptId={undefined}
      kind="description"
      from={undefined}
      onLeave={vi.fn()}
    />,
    deps([]),
  );
  await screen.findByLabelText("Name");
  await user.click(screen.getByRole("button", { name: "Start from an example" }));
  expect(screen.queryByRole("menuitem", { name: "Documentary delivery (built in)" })).toBeNull();
  await user.click(await screen.findByRole("menuitem", { name: "Built-in wording" }));
  expect(body().value).toBe(defaultDescriptionPrompt);
});

it("offers the saved prompts of the same kind as examples, and none at all where there are none", async () => {
  const user = userEvent.setup();
  const history: Prompt = {
    id: "p7",
    kind: "article",
    name: "History · Story",
    body: "Tell the story of {{Topic}}.",
    slots: ["Topic"],
    updatedAt: "2026-09-01T10:00:00.000Z",
  };
  const picture: Prompt = { ...history, id: "p8", kind: "image", name: "Oil scene" };
  renderRouted(
    <PromptEditorRoute promptId={undefined} kind="article" from={undefined} onLeave={vi.fn()} />,
    deps([history, picture]),
  );
  await user.click(await screen.findByRole("button", { name: "Start from an example" }));
  expect((await screen.findAllByRole("menuitem")).map((one) => one.textContent)).toEqual([
    "History · Story",
  ]);
  await user.click(screen.getByRole("menuitem", { name: "History · Story" }));
  expect(body().value).toBe("Tell the story of {{Topic}}.");
  cleanup();

  renderRouted(
    <PromptEditorRoute promptId={undefined} kind="thumbnail" from={undefined} onLeave={vi.fn()} />,
    deps([history, picture]),
  );
  await screen.findByLabelText("Name");
  expect(screen.queryByRole("button", { name: "Start from an example" })).toBeNull();
});

it("sets the text as prose: spell check on, an example in the empty box, no line numbers", async () => {
  await newEditor();
  const box = body();
  expect(box.getAttribute("spellcheck")).toBe("true");
  expect(box.getAttribute("placeholder")).toBe(
    "Tell the writer what to make and how. Put {{Topic}} where the video's subject goes.",
  );
  expect(screen.queryByText("0 of 100,000 characters")).toBeNull();
  expect(screen.getByText("Writes the article the narrator reads.")).not.toBeNull();
});

it("shows the kind on one line, and the full choice only on request", async () => {
  const user = userEvent.setup();
  await newEditor();
  expect(screen.getByText("Article prompt")).not.toBeNull();
  expect(screen.queryByRole("radio", { name: "Image" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Change kind" }));
  await user.click(screen.getByRole("radio", { name: "Image" }));
  expect(
    screen.getByText("An image prompt describes the pictures shown during the video."),
  ).not.toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "New image prompt" })).not.toBeNull();
});

it("keeps Save, Cancel and Delete in one bar pinned to the bottom of the window", async () => {
  renderRouted(
    <PromptEditorRoute promptId="p1" kind="article" from={undefined} onLeave={vi.fn()} />,
    deps([dossier]),
  );
  await screen.findByDisplayValue("Documentary dossier");
  const bar = screen.getByRole("button", { name: "Save" }).closest("[data-slot=editor-actions]");
  // The tour's target is the bar itself: a wrapper around it would be its sticky box.
  expect(bar?.getAttribute("data-tour")).toBe("prompt-save");
  expect(bar?.className).toContain("sticky");
  expect(bar?.parentElement?.getAttribute("data-tour")).not.toBe("prompt-save");
  expect(within(bar as HTMLElement).getByRole("button", { name: "Delete" })).not.toBeNull();
  expect(within(bar as HTMLElement).getByRole("link", { name: "Cancel" })).not.toBeNull();
});

it("saves and hands the saved prompt to Create from Save and make a video", async () => {
  const user = userEvent.setup();
  const spy = saveSpy([]);
  const made: string[] = [];
  const onLeave = vi.fn();
  renderRouted(
    <PromptEditorRoute
      promptId={undefined}
      kind="article"
      from={undefined}
      onLeave={onLeave}
      onMakeVideo={(prompt) => made.push(prompt.id)}
    />,
    deps([], { "POST /api/prompts": spy.answer }),
  );
  await screen.findByLabelText("Name");
  await user.type(screen.getByLabelText("Name"), "Dossier");
  await fill(user, "Instructions", "About {{topic}}.");
  await user.click(screen.getByRole("button", { name: "Save and make a video" }));
  await waitFor(() => {
    expect(spy.sent).toEqual([{ kind: "article", name: "Dossier", body: "About {{topic}}." }]);
  });
  await waitFor(() => expect(made).toEqual(["new"]), { timeout: 4000 });
  expect(onLeave).not.toHaveBeenCalled();
});

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

const body = () => screen.getByLabelText("Instructions") as HTMLTextAreaElement;

// The first paint under a router is asynchronous, so opening the editor waits for it.
async function newEditor(extra: Readonly<Record<string, Answer>> = {}, onLeave = vi.fn()) {
  const rendered = renderRouted(
    <PromptEditorRoute promptId={undefined} kind="article" from={undefined} onLeave={onLeave} />,
    deps([], extra),
  );
  await screen.findByLabelText("Name");
  return { ...rendered, onLeave };
}

describe("tutorial completion from the prompt editor", () => {
  it("requires a valid named body and keywords, then reports only the successful saved record", async () => {
    const user = userEvent.setup();
    const save = saveSpy([]);
    await newEditor({ "POST /api/prompts": save.answer });

    expect(tutorial.progress.mock.lastCall?.[0]).toEqual({
      promptNamed: false,
      promptBodyReady: false,
      promptHasKeywords: false,
      promptSaveReady: false,
      promptSaving: false,
      promptIsArticle: true,
      promptIsImage: false,
    });
    await fill(user, "Name", "My article");
    await fill(user, "Instructions", "Write about {{topic");
    expect(tutorial.progress.mock.lastCall?.[0]).toMatchObject({
      promptNamed: true,
      promptBodyReady: false,
      promptHasKeywords: false,
      promptSaveReady: false,
    });
    await fill(user, "Instructions", "Write about {{topic}}.");
    expect(tutorial.progress.mock.lastCall?.[0]).toMatchObject({
      promptBodyReady: true,
      promptHasKeywords: true,
      promptSaveReady: true,
    });
    expect(tutorial.event).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(tutorial.event).toHaveBeenCalledExactlyOnceWith({
        type: "prompt-saved",
        id: "new",
        kind: "article",
      });
    });
  });

  it("does not complete a save refused by the server", async () => {
    const user = userEvent.setup();
    const save = saveSpy([dossier]);
    await newEditor({ "POST /api/prompts": save.answer });
    await fill(user, "Name", dossier.name);
    await fill(user, "Instructions", dossier.body);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(tutorial.progress.mock.lastCall?.[0]).toMatchObject({
        promptNamed: false,
        promptSaveReady: false,
      });
    });
    expect(tutorial.event).not.toHaveBeenCalled();
  });
});

describe("the prompt editor's keywords panel", () => {
  it("invites the first keyword, then lists what the text asks for as chips", async () => {
    const user = userEvent.setup();
    await newEditor();

    expect(
      screen.getByText(
        "Type {{Topic}} where the video's subject goes. Each keyword becomes a question on Create.",
      ),
    ).not.toBeNull();

    await fill(user, "Instructions", "About {{topic}} in {{era}}.");
    expect(screen.getByText("topic").getAttribute("data-slot-chip")).toBe("topic");
    expect(screen.getByText("era").getAttribute("data-slot-chip")).toBe("era");
  });

  it("says a text without keywords runs as written", async () => {
    const user = userEvent.setup();
    await newEditor();

    await fill(user, "Instructions", "No slots at all.");
    expect(screen.getByText("It asks you for nothing: it runs as written.")).not.toBeNull();
  });
});

describe("the prompt editor's lint", () => {
  it("marks the offending opener where it stands and names its line and column", async () => {
    const user = userEvent.setup();
    const { container } = await newEditor();

    // The `{{` is the 16th character of the body: line 2, column 6.
    await fill(user, "Instructions", "Line one.\nThen {{bad");

    const marks = container.querySelectorAll("[data-lint-mark]");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("{{");
    expect(marks[0]?.getAttribute("data-lint-mark")).toBe("15");
    expect(screen.getByText("1 keyword error")).not.toBeNull();
    // In the list beside the text, and beside Save as the reason it holds.
    expect(
      screen.getAllByText(
        "The `{{` at line 2, column 6 is never closed. Add `}}` after the keyword name.",
      ),
    ).toHaveLength(2);
    expect(screen.getByLabelText("Instructions").getAttribute("aria-invalid")).toBe("true");
  });

  it("marks an empty slot and a nested one, and counts them", async () => {
    const user = userEvent.setup();
    const { container } = await newEditor();

    await fill(user, "Instructions", "{{}} and {{a{b}}");
    expect(container.querySelectorAll("[data-lint-mark]")).toHaveLength(2);
    expect(screen.getByText("2 keyword errors")).not.toBeNull();
    expect(
      screen.getAllByText(
        "The keyword at line 1, column 1 has no name. Write a name between `{{` and `}}`.",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        "The keyword at line 1, column 10 contains a brace. Keywords cannot be placed inside other keywords.",
      ),
    ).not.toBeNull();
  });

  it("leaves a well-formed body unmarked", async () => {
    const user = userEvent.setup();
    const { container } = await newEditor();

    await fill(user, "Instructions", "About {{topic}}.");
    expect(container.querySelectorAll("[data-lint-mark]")).toHaveLength(0);
    expect(screen.queryByText("1 keyword error")).toBeNull();
  });
});

describe("the prompt editor's Save", () => {
  it("says nothing on arrival, and names the missing name first once Save is pressed", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([]);
    await newEditor({ "POST /api/prompts": spy.answer });

    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("aria-disabled")).toBe("false");
    expect(screen.queryByText("Enter a name.")).toBeNull();

    await user.click(save);
    expect(spy.sent).toEqual([]);
    expect(save.getAttribute("aria-disabled")).toBe("true");
    // Beside Save, and under the field it is about, which gets the cursor.
    expect(screen.getAllByText("Enter a name.")).toHaveLength(2);
    const name = screen.getByLabelText("Name");
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute("aria-invalid")).toBe("true");

    // A malformed text does not change which problem is first: the name still is.
    await fill(user, "Instructions", "About {{bad");
    expect(document.getElementById(save.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Enter a name.",
    );
  });

  it("names an empty name once the field is left empty", async () => {
    const user = userEvent.setup();
    await newEditor();

    await user.click(screen.getByLabelText("Name"));
    await user.tab();
    expect(screen.getAllByText("Enter a name.").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
  });

  it("names the missing text once the name is there and Save is pressed", async () => {
    const user = userEvent.setup();
    await newEditor();

    await user.type(screen.getByLabelText("Name"), "Dossier");
    expect(screen.queryByText("Enter the text.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter the text.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("names the slot error, and points the button at the sentence", async () => {
    const user = userEvent.setup();
    await newEditor();

    await user.type(screen.getByLabelText("Name"), "Dossier");
    await fill(user, "Instructions", "About {{bad");

    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(save.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe(
      "The `{{` at line 1, column 7 is never closed. Add `}}` after the keyword name.",
    );
  });

  it("lets go once the body is fixed, and posts what was typed", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([]);
    const { onLeave } = await newEditor({ "POST /api/prompts": spy.answer });

    await user.type(screen.getByLabelText("Name"), "Dossier");
    await fill(user, "Instructions", "About {{bad");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");

    await fill(user, "Instructions", "About {{bad}}");

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
    await fill(user, "Instructions", "Anything.");
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
    // A valid field carries no aria-invalid at all (the kit Field sets it only with an error).
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("takes the same name under another kind, because a name is only taken within one", async () => {
    const user = userEvent.setup();
    const spy = saveSpy([dossier]);
    await newEditor({ "POST /api/prompts": spy.answer });

    await user.type(screen.getByLabelText("Name"), "Documentary dossier");
    await fill(user, "Instructions", "Anything.");
    await user.click(screen.getByRole("button", { name: "Change kind" }));
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
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe(
      "Compose a dossier on {{topic}}.",
    );
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe(
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.",
      ),
    ).not.toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Delete prompt" }));

    await waitFor(() => {
      expect(sent).toEqual(["/api/prompts/p1"]);
    });
    expect(onLeave).toHaveBeenCalledWith("article");
  });

  it("marks a saved Image prompt photorealistic at once, and offers it on Image prompts only", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    const painting = { ...dossier, id: "img1", kind: "image" as const, name: "Oil painting" };
    let listed: readonly Prompt[] = [painting];
    renderRouted(
      <PromptEditorRoute promptId="img1" kind="image" from={undefined} onLeave={vi.fn()} />,
      testDeps({
        "GET /api/prompts": (request) => jsonAnswer({ prompts: listed })(request),
        "PUT /api/prompts/img1/photorealistic": async (request) => {
          sent.push(await request.json());
          listed = [{ ...painting, photorealistic: true } as Prompt];
          return emptyAnswer()(request);
        },
      }),
    );
    const toggle = await screen.findByRole("switch", { name: "Draws photorealistic pictures" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute("aria-checked")).toBe("true");
    });
    expect(sent).toEqual([{ photorealistic: true }]);
    cleanup();
    renderRouted(
      <PromptEditorRoute promptId="p1" kind="article" from={undefined} onLeave={vi.fn()} />,
      deps([dossier]),
    );
    await screen.findByLabelText("Name");
    expect(screen.queryByRole("switch", { name: "Draws photorealistic pictures" })).toBeNull();
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
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe(
      "Compose a dossier on {{topic}}.",
    );
  });
});

describe("the prompt editor's keywords Slopify fills", () => {
  it("offers the keywords of the prompt's kind above the text, and follows a change of kind", async () => {
    const user = userEvent.setup();
    await newEditor();
    const bar = screen.getByRole("toolbar", { name: "Insert a keyword Slopify fills" });
    expect(within(bar).queryByRole("button", { name: "Insert Summary" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Change kind" }));
    await user.click(screen.getByRole("radio", { name: "Image" }));
    await user.click(within(bar).getByRole("button", { name: "Insert Summary" }));
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe(
      "{{Slopify_Summary}}",
    );
  });

  it("marks the keywords in the text for the prompt's kind", async () => {
    const user = userEvent.setup();
    const { container } = await newEditor();
    await fill(user, "Instructions", "{{Slopify_Title}} {{Slopify_Hook}}");
    const kinds = () =>
      [...container.querySelectorAll("[data-keyword-kind]")].map((span) =>
        span.getAttribute("data-keyword-kind"),
      );
    expect(kinds()).toEqual(["known", "misuse"]);
    await user.click(screen.getByRole("button", { name: "Change kind" }));
    await user.click(screen.getByRole("radio", { name: "Image" }));
    expect(kinds()).toEqual(["known", "known"]);
  });

  it("saves a stored prompt whose unknown Slopify_ name it already had, and refuses a new one", async () => {
    const user = userEvent.setup();
    const stored: Prompt = {
      ...dossier,
      body: "About {{Slopify_Wish}}.",
      slots: ["Slopify_Wish"],
    };
    renderRouted(
      <PromptEditorRoute promptId="p1" kind="article" from={undefined} onLeave={vi.fn()} />,
      deps([stored]),
    );
    await screen.findByDisplayValue("Documentary dossier");
    expect(screen.queryByText(/isn't a keyword Slopify fills/)).toBeNull();
    await fill(user, "Instructions", "About {{Slopify_Wish}} and {{Slopify_Other}}.");
    expect(
      screen.getAllByText(/\{\{Slopify_Other\}\} at line 1, column 28 isn't a keyword/).length,
    ).toBeGreaterThan(0);
  });
});
