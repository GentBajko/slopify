import type { DraftAttachment } from "@app/slices/play-drafts/model.js";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jsonAnswer } from "@/test-app";

const draftId = "00000000-0000-4000-8000-000000000001";
const audioId = "00000000-0000-4000-8000-000000000002";
export async function mountSupplied(
  over: Readonly<Record<string, import("@/test-app").Answer>> = {},
  interrupted = false,
): Promise<Awaited<ReturnType<typeof import("./play-test-fixture").mountPlay>>> {
  const { draftView, mountPlay } = await import("./play-test-fixture");
  const view = draftView(draftId, "Supplied draft");
  const form = view.draft.document.form;
  const mounted = await mountPlay({
    "GET /api/drafts": jsonAnswer({
      drafts: [
        {
          id: draftId,
          title: "Supplied draft",
          version: 1,
          updatedAt: "2026-09-13",
          readable: true,
        },
      ],
    }),
    [`GET /api/drafts/${draftId}`]: jsonAnswer({
      ...view,
      draft: {
        ...view.draft,
        document: {
          ...view.draft.document,
          form: {
            ...form,
            sources: {
              research: "off",
              article: "provide",
              audio: "provide",
              images: "off",
              thumbnail: "off",
              video: "off",
            },
            provided: {
              ...form.provided,
              article: "A supplied article.",
              audio: { attachmentId: audioId, name: "saved.wav" },
            },
          },
        },
      },
      attachments: [
        {
          id: audioId,
          kind: "audio",
          name: "saved.wav",
          state: interrupted ? "reattach" : "ready",
          stagedFileId: interrupted ? null : "00000000-0000-4000-8000-000000000099",
          bytes: 10,
          error: interrupted ? "Upload interrupted" : null,
        },
      ],
    }),
    ...over,
  });
  await userEvent.click(screen.getByRole("button", { name: "Drafts" }));
  await userEvent.click(await screen.findByRole("button", { name: "Supplied draft" }));
  await screen.findByLabelText("Article text");
  return mounted;
}

export function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}
export function ready(request: Request): DraftAttachment {
  return {
    id: new URL(request.url).pathname.split("/")[5] ?? "",
    kind: "audio",
    name: "old.wav",
    state: "ready",
    stagedFileId: "00000000-0000-4000-8000-000000000099",
    bytes: 10,
    error: null,
  };
}
