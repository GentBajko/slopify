import type { DraftAttachment } from "@app/slices/play-drafts/model.js";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jsonAnswer } from "@/test-app";

const draftId = "00000000-0000-4000-8000-000000000001";
const audioId = "00000000-0000-4000-8000-000000000002";
const imageId = "00000000-0000-4000-8000-000000000003";
export async function mountSupplied(
  over: Readonly<Record<string, import("@/test-app").Answer>> = {},
  interrupted = false,
  // With a video (your own images), so captions can be shown in it and a font uploaded.
  withVideo = false,
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
              images: withVideo ? "provide" : "off",
              thumbnail: "off",
              video: withVideo ? "generate" : "off",
            },
            provided: {
              ...form.provided,
              article: "A supplied article.",
              audio: { attachmentId: audioId, name: "saved.wav" },
              images: withVideo ? [{ attachmentId: imageId, name: "still.png" }] : [],
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
        ...(withVideo
          ? [
              {
                id: imageId,
                kind: "images" as const,
                name: "still.png",
                state: "ready" as const,
                stagedFileId: "00000000-0000-4000-8000-000000000098",
                bytes: 10,
                error: null,
              },
            ]
          : []),
      ],
    }),
    ...over,
  });
  await userEvent.click(screen.getByRole("button", { name: /^Draft: / }));
  await userEvent.click(await screen.findByRole("button", { name: "Supplied draft" }));
  await screen.findByDisplayValue("Supplied draft");
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
