import type { RevisionView } from "@app/slices/revisions/model.js";
import { useQueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { keys } from "@/queries";
import { jsonAnswer, openEditSection, renderRouted, testDeps } from "@/test-app";
import { response, staged } from "./revision-editor-test-fixtures.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionForm } from "./revision-form.js";
import { formOfRevision } from "./revision-form-state.js";

afterEach(cleanup);
// A stage's strip at the top of its section, named for the stage: "Images", "Video".
const strip = (stage: string) => within(screen.getByRole("radiogroup", { name: stage }));
const picked = (stage: string, choice: string | RegExp) =>
  strip(stage).getByRole("radio", { name: choice }).getAttribute("aria-checked") === "true";
function Subject(): import("react").ReactElement {
  const view = revisionView();
  const [edit, setEdit] = useState(formOfRevision(view));
  return (
    <RevisionForm view={view} edit={edit} onChange={setEdit} onPending={() => {}} fields={[]} />
  );
}
it("offers Article Off and pairs Images Off with Video Off", async () => {
  const user = userEvent.setup();
  renderRouted(
    <Subject />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  await openEditSection("Article");
  expect(strip("Article").queryByRole("radio", { name: "No text" })).not.toBeNull();
  await openEditSection("Images");
  await user.click(strip("Images").getByRole("radio", { name: "Made by AI (paid)" }));
  await openEditSection("Video and style");
  await user.click(strip("Video").getByRole("radio", { name: "Make the video" }));
  await openEditSection("Images");
  await user.click(strip("Images").getByRole("radio", { name: "None" }));
  await openEditSection("Video and style");
  expect(picked("Video", /^Off/)).toBe(true);
  expect(
    strip("Video").getByRole<HTMLButtonElement>("radio", { name: "Make the video" }).disabled,
  ).toBe(true);
  // The line under the strip says why.
  expect(screen.getByText(/A video needs images first\./)).not.toBeNull();
  // The silences are sound polish, folded under the video's style.
  await user.click(screen.getByText("Sound polish"));
  const gap = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Silence gap (seconds)" });
  await user.clear(gap);
  expect(gap.value).toBe("0");
  expect(
    screen.getByRole("spinbutton", { name: "Silence gap (seconds)" }).getAttribute("max"),
  ).toBe("30");
});

it("reads an absent Document source as Off and writes the source and theme", async () => {
  const user = userEvent.setup();
  const view = revisionView();
  let latest = formOfRevision(view);
  function Document(): import("react").ReactElement {
    const [edit, setEdit] = useState(formOfRevision(view));
    latest = edit;
    return (
      <RevisionForm view={view} edit={edit} onChange={setEdit} onPending={() => {}} fields={[]} />
    );
  }
  renderRouted(
    <Document />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  await openEditSection("Extras");
  expect(picked("PDF", "Off")).toBe(true);
  // The look only once there is a PDF to lay out.
  expect(screen.queryByRole("combobox", { name: "PDF look" })).toBeNull();
  await user.click(strip("PDF").getByRole("radio", { name: "Make a PDF" }));
  const theme = screen.getByRole<HTMLSelectElement>("combobox", { name: "PDF look" });
  // A project saved with no theme was drawn with DiceMaster, and still is; the retired built-in
  // is shown as this project's look, not offered as a choice.
  expect(theme.value).toBe("builtin:dicemaster");
  const builtIns = () =>
    Array.from(
      theme.querySelectorAll("optgroup[label='Built in'] option"),
      (one) => one.textContent,
    );
  expect(builtIns()).toEqual([
    "Plain",
    "Book",
    "Modern",
    "DiceMaster (retired, this project's look)",
  ]);
  await user.selectOptions(theme, "Plain");
  expect(latest.config.sources.document).toBe("generate");
  expect(latest.config.document).toEqual({ theme: "plain" });
  expect(builtIns()).toEqual(["Plain", "Book", "Modern"]);
});

it("shows the video timing settings only where the export uses them", async () => {
  const user = userEvent.setup();
  const base = revisionView();
  const view = {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: {
          ...base.revision.config.sources,
          audio: "provide" as const,
          images: "provide" as const,
          video: "generate" as const,
        },
      },
    },
  };
  let latest = formOfRevision(view);
  function Timing(): import("react").ReactElement {
    const [edit, setEdit] = useState(formOfRevision(view));
    latest = edit;
    return (
      <RevisionForm
        view={view}
        edit={edit}
        onChange={setEdit}
        onPending={() => {}}
        fields={[
          {
            field: "config.imageSeconds",
            message: "Enter a whole number of seconds between 1 and 600.",
          },
        ]}
      />
    );
  }
  renderRouted(
    <Timing />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  await openEditSection("Video and style");
  const seconds = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Seconds per image" });
  expect(seconds.value).toBe("15");
  // What each timing setting does is behind its info button, from the help catalogue.
  expect(
    screen.getByRole("button", { name: "About Seconds per image" }).getAttribute("data-help-id"),
  ).toBe("play.image-seconds");
  // In the summary above the sections, and under the field itself.
  expect(screen.getAllByText("Enter a whole number of seconds between 1 and 600.")).toHaveLength(2);
  await user.clear(seconds);
  await user.type(seconds, "20");
  expect(latest.config.imageSeconds).toBe(20);
  const zoom = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Zoom (%)" });
  expect(zoom.value).toBe("22.5");
  expect(screen.getByRole("button", { name: "About Zoom (%)" }).getAttribute("data-help-id")).toBe(
    "play.zoom",
  );
  await user.clear(zoom);
  await user.type(zoom, "0");
  expect(latest.config.zoomPercent).toBe(0);
  const motion = screen.getByRole<HTMLSelectElement>("combobox", { name: "Motion" });
  expect(motion.value).toBe("zoom");
  expect(screen.getByRole("button", { name: "About Motion" }).getAttribute("data-help-id")).toBe(
    "play.motion",
  );
  expect([...motion.options].map((option) => option.text)).toEqual([
    "Zoom in and out",
    "Pan across",
    "Mix of both",
    "Still",
  ]);
  await user.selectOptions(motion, "mixed");
  expect(latest.config.motionStyle).toBe("mixed");
  await user.click(screen.getByText("Sound polish"));
  const edge = screen.getByRole<HTMLInputElement>("spinbutton", {
    name: "Silence at start and end (seconds)",
  });
  expect(edge.getAttribute("step")).toBe("0.5");
  await user.clear(edge);
  await user.type(edge, "1.5");
  expect(latest.config.edgeSilenceSeconds).toBe(1.5);

  await openEditSection("Images");
  await user.click(strip("Images").getByRole("radio", { name: "None" }));
  await openEditSection("Video and style");
  expect(screen.queryByRole("spinbutton", { name: "Seconds per image" })).toBeNull();
  expect(screen.queryByRole("spinbutton", { name: "Zoom (%)" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Motion" })).toBeNull();
  await openEditSection("Narration");
  await user.click(strip("Narration").getByRole("radio", { name: "Off" }));
  expect(screen.queryByLabelText("Silence at start and end (seconds)")).toBeNull();
});

it("preserves saved unavailable choices, content references and frozen templates through unrelated changes", async () => {
  const user = userEvent.setup();
  const base = revisionView();
  const view = {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        values: { topic: "old" },
        sources: {
          ...base.revision.config.sources,
          article: "generate" as const,
          audio: "generate" as const,
        },
        llm: { provider: "gone-llm", model: "old-text", thinking: "high" as const },
        audio: { provider: "gone-tts", model: "old-voice-model", voice: "missing-voice" },
        intro: { name: "Deleted intro", mode: "text" as const },
        chunking: { mode: "characters" as const, characters: 1800 },
        rendered: { article: "Frozen old", intro: "Literal intro" },
      },
      content: {
        ...base.revision.content,
        provided: { audio: "retained-asset" },
        promptTemplates: { article: null, intro: null },
      },
    },
  };
  let latest = formOfRevision(view);
  function Preserved(): import("react").ReactElement {
    const [edit, setEdit] = useState(formOfRevision(view));
    return (
      <RevisionForm
        view={view}
        edit={edit}
        onPending={() => {}}
        fields={[]}
        onChange={(next) => {
          latest = next;
          setEdit(next);
        }}
      />
    );
  }
  renderRouted(
    <Preserved />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({
        prompts: [
          { id: "replacement", kind: "article", name: "Fresh template", body: "Write {{topic}}" },
        ],
      }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
      "GET /api/providers/gone-llm/models": jsonAnswer({ models: [], allowsCustom: false }),
      "GET /api/providers/gone-tts/models": jsonAnswer({ models: [], allowsCustom: false }),
    }),
  );
  // Written by and Read by each ask for a Service.
  const article = within(await screen.findByRole("region", { name: "Written by", hidden: true }));
  expect((article.getByLabelText("Service") as HTMLSelectElement).value).toBe("gone-llm");
  expect((article.getByLabelText("Model") as HTMLSelectElement).value).toBe("old-text");
  expect((article.getByLabelText("Thinking") as HTMLSelectElement).value).toBe("high");
  expect((screen.getByLabelText("Voice") as HTMLSelectElement).value).toBe("missing-voice");
  expect((screen.getByLabelText("Intro") as HTMLSelectElement).value).toBe("Deleted intro");
  await user.type(screen.getByLabelText("Project title"), " updated");
  await user.clear(screen.getByLabelText("topic"));
  await user.type(screen.getByLabelText("topic"), "new");
  expect(latest.config.rendered.article).toBe("Frozen old");
  expect(latest.content.provided.audio).toBe("retained-asset");
  expect(latest.config.llm).toEqual(view.revision.config.llm);
  expect(latest.config.audio).toEqual(view.revision.config.audio);
  expect(latest.config.chunking).toEqual(view.revision.config.chunking);
  await openEditSection("Article");
  await screen.findByRole("option", { name: "Fresh template" });
  await user.selectOptions(screen.getByLabelText("Use a saved prompt for Article"), "replacement");
  expect(latest.config.rendered.article).toBe("Write new");
  expect(latest.config.articlePrompt).toBe("Fresh template");
  expect(latest.content.promptTemplates.article).toBe("Write {{topic}}");
  expect(view.revision.content.promptTemplates.article).toBeNull();
});

it("copies an explicitly selected entry and ignores subsequent library changes", async () => {
  const user = userEvent.setup();
  const view = revisionView();
  let latest = formOfRevision(view);
  const entry = {
    id: "intro",
    category: "intro",
    name: "Greeting",
    body: "Hello {{topic}}",
    mode: "text",
  };
  function LibraryChange(): import("react").ReactElement {
    const client = useQueryClient();
    const [edit, setEdit] = useState(formOfRevision(view));
    return (
      <>
        <button
          type="button"
          onClick={() =>
            client.setQueryData(keys.entries, {
              entries: [{ ...entry, body: "Changed elsewhere", mode: "llm" }],
            })
          }
        >
          Update library
        </button>
        <RevisionForm
          view={view}
          edit={edit}
          onPending={() => {}}
          fields={[]}
          onChange={(next) => {
            latest = next;
            setEdit(next);
          }}
        />
      </>
    );
  }
  renderRouted(
    <LibraryChange />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [entry] }),
    }),
  );
  await openEditSection("Narration");
  await screen.findByRole("option", { name: "Greeting" });
  await user.selectOptions(screen.getByLabelText("Intro"), "Greeting");
  await user.type(screen.getByLabelText("topic"), "world");
  expect(latest.config.intro).toEqual({ name: "Greeting", mode: "text" });
  expect(latest.config.rendered.intro).toBe("Hello world");
  await user.click(screen.getByRole("button", { name: "Update library" }));
  expect((screen.getByLabelText("Raw prompt for Intro") as HTMLTextAreaElement).value).toBe(
    "Hello {{topic}}",
  );
  expect(latest.config.intro?.mode).toBe("text");
  await user.selectOptions(screen.getByLabelText("Use a saved prompt for Intro"), "intro");
  expect(latest.config.intro?.mode).toBe("llm");
  expect(latest.config.rendered.intro).toBe("Changed elsewhere");
});

it("retains content upload pending state when a field changes", async () => {
  const user = userEvent.setup();
  const pending = vi.fn<(pending: boolean) => void>();
  const view = revisionView();
  function Uploading(): import("react").ReactElement {
    const [edit, setEdit] = useState(formOfRevision(view));
    return (
      <RevisionForm
        view={view}
        edit={edit}
        onChange={setEdit}
        onPending={pending}
        fields={[]}
        renderContent={(props) => (
          <>
            <button type="button" onClick={() => props.onPending(true)}>
              Start content upload
            </button>
            <button type="button" onClick={() => props.onPending(false)}>
              Finish content upload
            </button>
          </>
        )}
      />
    );
  }
  renderRouted(
    <Uploading />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Start content upload" }));
  await user.type(screen.getByLabelText("Project title"), " changed");
  expect(pending.mock.calls.map(([value]) => value)).toEqual([false, true]);
  await user.click(screen.getByRole("button", { name: "Finish content upload" }));
  expect(pending.mock.calls.map(([value]) => value)).toEqual([false, true, false]);
});

it("adopts saved wording as a template only after an explicit click", async () => {
  const user = userEvent.setup();
  const base = revisionView();
  const view = {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        values: { topic: "new" },
        rendered: { article: "Saved literal wording." },
      },
      content: { ...base.revision.content, promptTemplates: { article: null } },
    },
  };
  let latest = formOfRevision(view);
  function Frozen(): import("react").ReactElement {
    const [edit, setEdit] = useState(formOfRevision(view));
    return (
      <RevisionForm
        view={view}
        edit={edit}
        onPending={() => {}}
        fields={[]}
        onChange={(next) => {
          latest = next;
          setEdit(next);
        }}
      />
    );
  }
  renderRouted(
    <Frozen />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  expect(latest.content.promptTemplates.article).toBeNull();
  await openEditSection("Article");
  await user.click(
    screen.getByRole("button", { name: "Use saved wording as template for Article" }),
  );
  expect(latest.content.promptTemplates.article).toBe("Saved literal wording.");
  expect(latest.config.rendered.article).toBe("Saved literal wording.");
  expect((screen.getByLabelText("Raw prompt for Article") as HTMLTextAreaElement).value).toBe(
    "Saved literal wording.",
  );
});

it("switches the YouTube description on in Outputs and freezes or drops its prompt", async () => {
  const user = userEvent.setup();
  const base = revisionView();
  const view = {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "provide" as const },
      },
    },
  };
  let latest = formOfRevision(view);
  function Describe(): import("react").ReactElement {
    const [edit, setEdit] = useState(formOfRevision(view));
    latest = edit;
    return (
      <RevisionForm view={view} edit={edit} onChange={setEdit} onPending={() => {}} fields={[]} />
    );
  }
  renderRouted(
    <Describe />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({
        prompts: [
          {
            id: "d1",
            kind: "description",
            name: "Hooky",
            body: "Hook {{Topic}} fans.",
            slots: ["Topic"],
            updatedAt: "2026-09-03T00:00:00.000Z",
          },
        ],
      }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  await openEditSection("Extras");
  const on = screen.getByRole<HTMLInputElement>("checkbox", { name: /YouTube description/ });
  expect(on.checked).toBe(false);
  expect(screen.queryByRole("combobox", { name: "Description prompt" })).toBeNull();
  await user.click(on);
  expect(latest.config.youtubeDescription).toBe(true);
  const prompt = screen.getByRole<HTMLSelectElement>("combobox", { name: "Description prompt" });
  await screen.findByRole("option", { name: "Hooky" });
  await user.selectOptions(prompt, "Hooky");
  expect(latest.config.descriptionPrompt).toBe("Hooky");
  expect(latest.content.promptTemplates.description).toBe("Hook {{Topic}} fans.");
  await user.selectOptions(prompt, "");
  expect(latest.config.descriptionPrompt).toBeUndefined();
  expect(latest.content.promptTemplates.description).toBeUndefined();
  expect(latest.config.rendered.description).toBeUndefined();
  await user.click(on);
  expect(latest.config.youtubeDescription).toBe(false);
});

// A project whose shorts were picked: two clips over ten sentences of ten seconds each.
function shortsView() {
  const base = revisionView();
  const sentences = Array.from({ length: 10 }, (_value, at) => ({
    start: at * 10,
    end: at * 10 + 9.5,
    text: `Sentence ${String(at + 1)}.`,
  }));
  const clip = (number: number, first: number, last: number) => ({
    number,
    first,
    last,
    start: (first - 1) * 10 - 0.25,
    end: (last - 1) * 10 + 9.75,
    title: `Short ${String(number)} title`,
    description: "One line.",
    hashtags: ["#One"],
    why: "",
    text: "Said.",
    seed: null,
  });
  return {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "provide" as const },
        shorts: { enabled: true, count: 2, minSeconds: 20, maxSeconds: 40 },
      },
    },
    pieces: [
      {
        recordId: "pick",
        publicationId: null,
        selected: true,
        available: true,
        key: "shorts:pick",
        stageKind: "video" as const,
        assetId: null,
        fingerprint: "pick-fingerprint",
        piece: {
          id: "pick",
          stageId: "s-video",
          kind: "article_written" as const,
          idx: 10000,
          state: "done" as const,
          payload: JSON.stringify({
            shorts: [clip(1, 2, 4), clip(2, 7, 9)],
            durationSeconds: 100,
            sentences,
          }),
        },
      },
    ],
  };
}

function mountShorts(
  view: RevisionView,
  extra: Readonly<Record<string, (request: Request) => Promise<Response> | Response>> = {},
) {
  const state = { latest: formOfRevision(view) };
  function Cut(): import("react").ReactElement {
    const [edit, setEdit] = useState(formOfRevision(view));
    state.latest = edit;
    return (
      <RevisionForm view={view} edit={edit} onChange={setEdit} onPending={() => {}} fields={[]} />
    );
  }
  renderRouted(
    <Cut />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({
        prompts: [
          {
            id: "s1",
            kind: "shorts",
            name: "Hooks",
            body: "Pick the boldest claims.",
            slots: [],
            updatedAt: "2026-09-03T00:00:00.000Z",
          },
        ],
      }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
      ...extra,
    }),
  );
  return state;
}

it("sets the Shorts in their own section: numbers, prompts and the more options", async () => {
  const user = userEvent.setup();
  const state = mountShorts(shortsView());
  await openEditSection("Extras");
  const count = screen.getByRole<HTMLInputElement>("textbox", { name: "Shorts per video" });
  expect(count.value).toBe("2");
  await user.clear(count);
  await user.type(count, "5");
  expect(state.latest.config.shorts?.count).toBe(5);
  await screen.findByRole("option", { name: "Hooks" });
  await user.selectOptions(
    screen.getByRole<HTMLSelectElement>("combobox", { name: "Shorts prompt" }),
    "Hooks",
  );
  expect(state.latest.config.shorts?.prompt).toBe("Hooks");
  expect(state.latest.content.promptTemplates.shorts).toBe("Pick the boldest claims.");
  // A project saved before the title, speed, music and link reads as all of them unset.
  const more = screen.getByText("More shorts options");
  const foldState = () => more.closest("summary")?.querySelector(".sl-fold__state")?.textContent;
  expect(foldState()).toBe("No title on screen");
  await user.click(more);
  await user.click(screen.getByRole("checkbox", { name: /Title on screen/ }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Speed" }), "1.15");
  await user.type(screen.getByRole("textbox", { name: /Music volume/ }), "30");
  await user.type(
    screen.getByRole("textbox", { name: "Full video link" }),
    "https://youtu.be/full",
  );
  expect(state.latest.config.shorts).toMatchObject({
    count: 5,
    titleOnScreen: true,
    speed: 1.15,
    musicVolume: 30,
    fullVideoLink: "https://youtu.be/full",
  });
  expect(foldState()).toBe("Title on screen · 1.15× · Music at 30% · Full video linked");
  await user.click(screen.getByRole("checkbox", { name: /^Shorts/ }));
  expect(state.latest.config.shorts).toMatchObject({ enabled: false, count: 5, prompt: "Hooks" });
});

it("moves a picked clip by a sentence, or to a range of one's own, and says when it can't", async () => {
  const user = userEvent.setup();
  const state = mountShorts(shortsView());
  await openEditSection("Extras");
  const first = screen.getByRole("listitem", { name: "Short 1 · Short 1 title" });
  expect(within(first).getByText("Starts: “Sentence 2.”")).not.toBeNull();
  expect(within(first).getByText("Ends: “Sentence 4.”")).not.toBeNull();
  await user.click(within(first).getByRole("button", { name: "Later end of short 1" }));
  expect(state.latest.content.shortsRanges).toEqual({
    "1": { first: 2, last: 5, pick: "pick-fingerprint" },
  });
  expect(within(first).getByText("Ends: “Sentence 5.”")).not.toBeNull();
  // Four sentences are 40 s, the longest allowed; one more is too long, and it says so.
  await user.click(within(first).getByRole("button", { name: "Later end of short 1" }));
  expect(within(first).getByRole("alert").textContent).toBe(
    "Short 1 would last 50 seconds, longer than the 40-second maximum. Start it later or end it earlier.",
  );
  await user.click(within(first).getByRole("button", { name: "Use my own range" }));
  await user.selectOptions(within(first).getByRole("combobox", { name: "Start sentence" }), "3");
  await user.selectOptions(within(first).getByRole("combobox", { name: "End sentence" }), "5");
  expect(state.latest.content.shortsRanges).toEqual({
    "1": { first: 3, last: 5, pick: "pick-fingerprint" },
  });
  expect(within(first).queryByRole("alert")).toBeNull();
  // Back to the model's own clip, and no range is kept.
  await user.click(within(first).getByRole("button", { name: "Back to the AI's choice" }));
  expect(state.latest.content.shortsRanges).toBeUndefined();
});

it("makes one short again, or picks different moments, through the edit's regenerate list", async () => {
  const user = userEvent.setup();
  const view = shortsView();
  const state = mountShorts({
    ...view,
    revision: {
      ...view.revision,
      content: {
        ...view.revision.content,
        shortsRanges: { "2": { first: 6, last: 9, pick: "pick-fingerprint" } },
      },
    },
  });
  await openEditSection("Extras");
  const second = screen.getByRole("listitem", { name: "Short 2 · Short 2 title" });
  await user.click(within(second).getByRole("button", { name: "Make this short again" }));
  expect(state.latest.regenerate).toEqual(["shorts:2"]);
  await user.click(within(second).getByRole("button", { name: "Keep this short" }));
  expect(state.latest.regenerate).toEqual([]);
  await user.click(screen.getByRole("button", { name: "Pick different moments" }));
  expect(state.latest.regenerate).toEqual(["shorts:pick"]);
  // Ranges set on these clips would not apply to the new ones.
  expect(state.latest.content.shortsRanges).toBeUndefined();
  await user.click(screen.getByRole("button", { name: "Keep the current moments" }));
  expect(state.latest.regenerate).toEqual([]);
});

it("uploads background music for the shorts and removes it again", async () => {
  const state = mountShorts(shortsView(), {
    "POST /api/staging/audio": async () => response({ ...staged, stageKind: "audio" }),
  });
  await openEditSection("Extras");
  await userEvent.click(screen.getByText(/More shorts options/));
  fireEvent.change(screen.getByLabelText(/Background music \(optional\)/), {
    target: { files: [new File(["music"], "loop.mp3", { type: "audio/mpeg" })] },
  });
  await waitFor(() =>
    expect(state.latest.uploads).toEqual([
      { stagedFileId: "upload1", destination: { kind: "shortsMusic" } },
    ]),
  );
  expect(screen.getByLabelText("Replace the background music")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Remove the music" }));
  expect(state.latest.uploads).toEqual([]);
  expect(state.latest.content.shortsMusic).toBeUndefined();
});

it("shows an old project's video as it was, and writes edit settings only once one changes", async () => {
  const user = userEvent.setup();
  const view = revisionView();
  let latest = formOfRevision(view);
  function Video(): import("react").ReactElement {
    const [edit, setEdit] = useState(formOfRevision(view));
    latest = edit;
    return (
      <RevisionForm view={view} edit={edit} onChange={setEdit} onPending={() => {}} fields={[]} />
    );
  }
  renderRouted(
    <Video />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  await openEditSection("Images");
  await user.click(strip("Images").getByRole("radio", { name: "Made by AI (paid)" }));
  await openEditSection("Video and style");
  await user.click(strip("Video").getByRole("radio", { name: "Make the video" }));
  // Saved before the settings: cuts every N seconds, a plain Look, and nothing written.
  expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Cuts" }).value).toBe("interval");
  expect(screen.getByText("Plain cuts, no effects")).not.toBeNull();
  expect(latest.config.videoEdit).toBeUndefined();
  await user.click(screen.getByText("Look"));
  await user.selectOptions(screen.getByRole("combobox", { name: "Color grade" }), "sepia");
  expect(latest.config.videoEdit).toMatchObject({ cuts: "interval", grade: "sepia" });
  expect(screen.getByText("Look").nextElementSibling?.textContent).toBe("Sepia");
});

it("offers this project's outro or the newer one when it has changed in Prompts", async () => {
  const user = userEvent.setup();
  const base = revisionView();
  const view: RevisionView = {
    ...base,
    revision: {
      ...base.revision,
      config: { ...base.revision.config, outro: { name: "Closing", mode: "llm" } },
      content: {
        ...base.revision.content,
        promptTemplates: { ...base.revision.content.promptTemplates, outro: "Say goodbye." },
      },
    },
  };
  function Outro(): import("react").ReactElement {
    const [edit, setEdit] = useState(formOfRevision(view));
    return (
      <>
        <RevisionForm view={view} edit={edit} onChange={setEdit} onPending={() => {}} fields={[]} />
        <output aria-label="Outro wording">{edit.content.promptTemplates.outro}</output>
      </>
    );
  }
  renderRouted(
    <Outro />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({
        entries: [
          {
            id: "e1",
            category: "outro",
            mode: "llm",
            name: "Closing",
            body: "Say goodbye warmly.",
            slots: [],
            updatedAt: "today",
          },
        ],
      }),
    }),
  );
  await openEditSection("Narration");
  const picker = await screen.findByRole("combobox", { name: "Outro" });
  await screen.findByRole("option", { name: "Closing · newer wording from Prompts" });
  expect(screen.getByRole("option", { name: "Closing · this project's version" })).toBeDefined();
  // It starts on the project's own wording.
  expect(screen.getByLabelText("Outro wording").textContent).toBe("Say goodbye.");
  await user.selectOptions(picker, "Closing");
  expect(screen.getByLabelText("Outro wording").textContent).toBe("Say goodbye warmly.");
  await user.selectOptions(
    picker,
    screen.getByRole("option", { name: "Closing · this project's version" }),
  );
  expect(screen.getByLabelText("Outro wording").textContent).toBe("Say goodbye.");
});
