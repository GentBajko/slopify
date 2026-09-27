import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { mountSupplied, ready, response } from "./draft-upload-test-fixture";

afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});

async function lastSaved(requests: readonly Request[]): Promise<PlayDraftDocument | undefined> {
  const saves = requests.filter(
    (sent) => sent.method === "PUT" && /\/drafts\/[a-f0-9-]+$/.test(sent.url),
  );
  const body = await saves.at(-1)?.clone().json();
  return (body as { document?: PlayDraftDocument } | undefined)?.document;
}

it("uploads the shorts' background music as a draft attachment from More shorts options", async () => {
  const uploads: Request[] = [];
  const { requests } = await mountSupplied({
    "PUT /api/drafts/:id/attachments/:attachmentId/file": (sent) => {
      uploads.push(sent);
      return response({ ...ready(sent), name: "bed.mp3" });
    },
  });
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  const music = screen.getByLabelText(/^Background music/);
  // Kept on screen with Shorts off, but not pickable.
  expect(music.hasAttribute("disabled")).toBe(true);
  await userEvent.click(screen.getByRole("checkbox", { name: /^Shorts/ }));
  await userEvent.click(screen.getByText(/^More shorts options/));
  await userEvent.upload(music, new File(["mp3"], "bed.mp3", { type: "audio/mpeg" }));
  await waitFor(() => expect(uploads).toHaveLength(1));
  const attachmentId = new URL(uploads[0]?.url ?? "").pathname.split("/")[5];
  await waitFor(async () =>
    expect((await lastSaved(requests))?.form.provided.shortsMusic).toEqual({
      attachmentId,
      name: "bed.mp3",
    }),
  );
  // Staged beside the narration file it sits under.
  await waitFor(() => expect(screen.getAllByText("Staged")).toHaveLength(2));
  expect(screen.getByText(/More shorts options · .*Music: bed\.mp3/)).not.toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Remove bed.mp3" }));
  await waitFor(async () =>
    expect((await lastSaved(requests))?.form.provided.shortsMusic).toBeNull(),
  );
  // The narration file it sits beside is left as it was.
  expect((await lastSaved(requests))?.form.provided.audio?.name).toBe("saved.wav");
});
