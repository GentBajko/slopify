import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import type { Prompt } from "@/api";
import { jsonAnswer, renderApp, renderRouted, testDeps } from "@/test-app";
import { EditChannel } from "./edit-channel.js";
import { EditImagePrompts } from "./edit-image-prompts.js";
import { revisionView } from "./revision-fixture.js";
import { formOfRevision } from "./revision-form-state.js";

afterEach(cleanup);

const prompt = (name: string, body: string): Prompt => ({
  id: name,
  kind: "image",
  name,
  body,
  slots: [],
  updatedAt: "2026-09-27",
});
const prompts = [prompt("Castle", "A castle"), prompt("Forest", "A forest")];

// A project whose images come from Castle, twice.
function planned(): RevisionEdit {
  const view = revisionView();
  const edit = formOfRevision(view);
  const image = { source: "generate" as const, assetId: null, prompt: "A castle" };
  return {
    config: {
      ...edit.config,
      sources: { ...edit.config.sources, images: "generate" },
      imagePrompts: [{ name: "Castle", number: 2 }],
      rendered: { "imagePrompts.0": "A castle" },
    },
    content: {
      ...edit.content,
      imageOrder: ["one", "two"],
      imageDefinitions: {
        one: { ...image, templateKey: "imagePrompts.0" },
        two: { ...image, templateKey: "imagePrompts.0" },
      },
      promptTemplates: { "imagePrompts.0": "A castle" },
    },
  };
}

it("changes the image prompts and Numbers with Play's control and says what saving does", async () => {
  const user = userEvent.setup();
  const saved = planned();
  let latest = saved;
  function Subject() {
    const [edit, setEdit] = useState(saved);
    latest = edit;
    return (
      <EditImagePrompts
        edit={edit}
        saved={saved.config.imagePrompts}
        prompts={prompts}
        problem={() => undefined}
        onChange={setEdit}
      />
    );
  }
  renderApp(<Subject />, testDeps({}));
  expect(screen.queryByRole("status")).toBeNull();
  await user.click(screen.getByRole("checkbox", { name: "Forest" }));
  expect(latest.config.imagePrompts).toEqual([
    { name: "Castle", number: 2 },
    { name: "Forest", number: 1 },
  ]);
  // The images are planned again only when saved; the content keeps its saved numbering.
  expect(latest.content).toEqual(saved.content);
  expect(screen.getByRole("status").textContent).toContain("Saving adds 1 image to make");
  await user.click(screen.getByRole("checkbox", { name: "Castle" }));
  expect(screen.getByRole("status").textContent).toContain(
    "Saving adds 1 image to make and removes 2 images",
  );
});

it("shows nothing for a project whose images are off", () => {
  const edit = formOfRevision(revisionView());
  renderApp(
    <EditImagePrompts
      edit={edit}
      saved={[]}
      prompts={prompts}
      problem={() => undefined}
      onChange={() => undefined}
    />,
    testDeps({}),
  );
  expect(screen.queryByRole("region", { name: "Image prompts" })).toBeNull();
});

it("moves the project to another channel and switches the brand kit off", async () => {
  const user = userEvent.setup();
  const saved = formOfRevision(revisionView());
  let latest = saved;
  function Subject() {
    const [edit, setEdit] = useState(saved);
    latest = edit;
    return (
      <EditChannel edit={edit} saved={saved.config} problem={() => undefined} onChange={setEdit} />
    );
  }
  const channel = (id: string, name: string, cast: number) => ({
    id,
    name,
    isDefault: id === "default",
    brand: {},
    seriesBrief: "",
    version: 1,
    createdAt: "a",
    updatedAt: "a",
    templates: 0,
    cast,
  });
  renderRouted(
    <Subject />,
    testDeps({
      "GET /api/channels": jsonAnswer({
        channels: [channel("default", "My channel", 0), channel("lore", "Lore", 2)],
      }),
    }),
  );
  const picker = await screen.findByRole<HTMLSelectElement>("combobox", { name: "Channel" });
  await screen.findByRole("option", { name: "Lore · 2 in the cast" });
  expect(screen.queryByText(/Saving moves the project/)).toBeNull();
  await user.selectOptions(picker, "lore");
  expect(latest.config.channelId).toBe("lore");
  expect(screen.getByText(/Saving moves the project to this channel/)).toBeDefined();
  await user.click(screen.getByRole("switch", { name: "Use the channel's brand kit" }));
  expect(latest.config.useBrandKit).toBe(false);
  expect(screen.getByText("Its cast is still used.")).toBeDefined();
  await user.click(screen.getByRole("switch", { name: "Use the channel's brand kit" }));
  // On is the default, so the setting is left out rather than saved as true.
  expect(latest.config).not.toHaveProperty("useBrandKit");
});
