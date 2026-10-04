import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultChannelId } from "@/channels/api";
import { CurrentChannelProvider } from "@/channels/current";
import { CommandPaletteProvider } from "@/components/kit/command-palette";
import { PlayForm } from "@/routes/play";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { PlayDraftProvider, type PlaySession, usePlaySession } from "./draft-context";
import { mountPlay, openRow, playRoutes } from "./play-test-fixture";
import { reviewStorage } from "./review-test-harness";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const rowNames = (): readonly string[] =>
  Array.from(document.querySelectorAll("[data-setup-row]"), (row) =>
    row.getAttribute("data-setup-row"),
  ).filter((id): id is string => id !== null);

it("asks what is being made first and shows only that work's setup", async () => {
  const { session } = await mountPlay();
  const choice = screen.getByRole("radiogroup", { name: "What are you making?" });
  expect(
    within(choice)
      .getAllByRole("radio")
      .map((one) => one.getAttribute("aria-label")),
  ).toEqual(["Video", "Article", "Audiobook", "Podcast", "Images"]);
  expect(screen.getByRole("heading", { name: "What's the video about?" })).not.toBeNull();
  expect(rowNames()).toContain("images");

  await userEvent.click(within(choice).getByRole("radio", { name: "Article" }));
  expect(screen.getByRole("heading", { name: "What's the article about?" })).not.toBeNull();
  // No voice, pictures or video for an article, and nothing asks for a channel or YouTube.
  expect(rowNames()).not.toContain("narration");
  expect(rowNames()).not.toContain("images");
  expect(rowNames()).not.toContain("video");
  expect(session().document.form.sources).toMatchObject({ audio: "off", images: "off" });

  await userEvent.click(within(choice).getByRole("radio", { name: "Podcast" }));
  expect(session().document.form.voices?.format).toBe("podcast");
  expect(rowNames()).toContain("narration");
  expect(rowNames()).not.toContain("images");
  await openRow("Outputs");
  // The video's publishing extras fold away for standalone work.
  expect(screen.getByText(/^Publishing extras/)).not.toBeNull();
});

it("reads the person's text as written and shows what will be spoken", async () => {
  await mountPlay();
  await openRow("Article");
  await userEvent.click(screen.getByRole("radio", { name: "Use my text as written" }));
  await userEvent.type(screen.getByLabelText("Article text"), "Dr. Ada narrates this.");
  await userEvent.click(screen.getByText("Show the text that will be spoken"));
  expect(screen.getByLabelText("Text that will be spoken").textContent?.trim()).toBe(
    "Dr. Ada narrates this.",
  );
  await userEvent.click(screen.getByRole("radio", { name: "Adapt my text" }));
  // The pasted text moves to what the article prompt rewrites.
  expect((screen.getByLabelText("Your text") as HTMLTextAreaElement).value).toBe(
    "Dr. Ada narrates this.",
  );
  expect(screen.getByLabelText("Article prompt")).not.toBeNull();
});

it("starts a fresh draft in the channel the sidebar shows", async () => {
  window.localStorage.setItem("slopify.channel", "c-2");
  const channel = (id: string, name: string, isDefault: boolean) => ({
    id,
    name,
    isDefault,
    brand: {},
    seriesBrief: "",
    aiDisclosure: "auto",
    version: 1,
    createdAt: "a",
    updatedAt: "a",
    templates: 0,
    cast: 0,
  });
  let captured: PlaySession | undefined;
  function Capture(): ReactElement {
    captured = usePlaySession();
    return <PlayForm onCreated={vi.fn()} />;
  }
  renderRouted(
    <CommandPaletteProvider>
      <CurrentChannelProvider>
        <PlayDraftProvider>
          <Capture />
        </PlayDraftProvider>
      </CurrentChannelProvider>
    </CommandPaletteProvider>,
    testDeps(
      playRoutes({
        "GET /api/channels": jsonAnswer({
          channels: [channel(defaultChannelId, "Main", true), channel("c-2", "Second", false)],
        }),
      }),
    ),
  );
  await screen.findByRole("option", { name: "Dossier" });
  await waitFor(() => expect(captured?.document.channelId).toBe("c-2"));
  await act(async () => {});
});
