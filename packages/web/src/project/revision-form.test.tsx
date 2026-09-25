import { useQueryClient } from "@tanstack/react-query";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { keys } from "@/queries";
import { jsonAnswer, openEditSection, renderApp, testDeps } from "@/test-app";
import { revisionView } from "./revision-fixture.js";
import { RevisionForm } from "./revision-form.js";
import { formOfRevision } from "./revision-form-state.js";

afterEach(cleanup);
function Subject(): import("react").ReactElement {
  const view = revisionView();
  const [edit, setEdit] = useState(formOfRevision(view));
  return (
    <RevisionForm view={view} edit={edit} onChange={setEdit} onPending={() => {}} fields={[]} />
  );
}
it("keeps Article required and pairs Images Off with Video Off", async () => {
  const user = userEvent.setup();
  renderApp(
    <Subject />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  const article = screen.getByRole("combobox", { name: "article source" });
  expect(within(article).queryByRole("option", { name: "Off" })).toBeNull();
  await user.selectOptions(screen.getByRole("combobox", { name: "images source" }), "generate");
  await user.selectOptions(screen.getByRole("combobox", { name: "video source" }), "generate");
  await user.selectOptions(screen.getByRole("combobox", { name: "images source" }), "off");
  const video = screen.getByRole("combobox", { name: "video source" });
  if (!(video instanceof HTMLSelectElement)) throw new Error("Expected video source select.");
  expect(video.value).toBe("off");
  expect(within(video).getByRole<HTMLOptionElement>("option", { name: "Generate" }).disabled).toBe(
    true,
  );
  const gap = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Silence gap (seconds)" });
  await user.clear(gap);
  expect(gap.value).toBe("0");
  expect(
    screen.getByRole("spinbutton", { name: "Silence gap (seconds)" }).getAttribute("max"),
  ).toBe("30");
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
  renderApp(
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
  expect((screen.getByLabelText("Text provider") as HTMLSelectElement).value).toBe("gone-llm");
  expect((screen.getByLabelText("Text model") as HTMLSelectElement).value).toBe("old-text");
  expect((screen.getByLabelText("Thinking") as HTMLSelectElement).value).toBe("high");
  expect((screen.getByLabelText("Narration voice") as HTMLSelectElement).value).toBe(
    "missing-voice",
  );
  expect((screen.getByLabelText("intro") as HTMLSelectElement).value).toBe("Deleted intro");
  await user.type(screen.getByLabelText("Project title"), " updated");
  await user.clear(screen.getByLabelText("Keyword topic"));
  await user.type(screen.getByLabelText("Keyword topic"), "new");
  expect(latest.config.rendered.article).toBe("Frozen old");
  expect(latest.content.provided.audio).toBe("retained-asset");
  expect(latest.config.llm).toEqual(view.revision.config.llm);
  expect(latest.config.audio).toEqual(view.revision.config.audio);
  expect(latest.config.chunking).toEqual(view.revision.config.chunking);
  await openEditSection("Prompts");
  await screen.findByRole("option", { name: "Fresh template" });
  await user.selectOptions(screen.getByLabelText("Use saved template for Article"), "replacement");
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
  renderApp(
    <LibraryChange />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [entry] }),
    }),
  );
  await screen.findByRole("option", { name: "Greeting" });
  await user.selectOptions(screen.getByLabelText("intro"), "Greeting");
  await user.type(screen.getByLabelText("Keyword topic"), "world");
  expect(latest.config.intro).toEqual({ name: "Greeting", mode: "text" });
  expect(latest.config.rendered.intro).toBe("Hello world");
  await user.click(screen.getByRole("button", { name: "Update library" }));
  expect((screen.getByLabelText("Raw prompt for Intro") as HTMLTextAreaElement).value).toBe(
    "Hello {{topic}}",
  );
  expect(latest.config.intro?.mode).toBe("text");
  await user.selectOptions(screen.getByLabelText("Use saved template for Intro"), "intro");
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
  renderApp(
    <Uploading />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  await user.click(screen.getByRole("button", { name: "Start content upload" }));
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
  renderApp(
    <Frozen />,
    testDeps({
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
    }),
  );
  expect(latest.content.promptTemplates.article).toBeNull();
  await openEditSection("Prompts");
  await user.click(
    screen.getByRole("button", { name: "Use saved wording as template for Article" }),
  );
  expect(latest.content.promptTemplates.article).toBe("Saved literal wording.");
  expect(latest.config.rendered.article).toBe("Saved literal wording.");
  expect((screen.getByLabelText("Raw prompt for Article") as HTMLTextAreaElement).value).toBe(
    "Saved literal wording.",
  );
});
