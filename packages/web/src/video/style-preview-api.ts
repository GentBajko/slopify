import {
  type StylePreviewReply,
  type StylePreviewRequest,
  stylePreviewReplySchema,
} from "@app/slices/style-preview/schema.js";
import type { Api } from "@/api";
import { failure, understood } from "@/http";

export type { StylePreviewReply, StylePreviewRequest };

// Renders (or finds the saved) style preview and answers where to play it. A refusal throws
// the server's own sentence, which says what failed and how to fix it.
export async function renderStylePreview(
  api: Api,
  request: StylePreviewRequest,
  signal?: AbortSignal,
): Promise<StylePreviewReply & { readonly src: string }> {
  const response = await api.fetch(`${api.origin}/api/style-preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw await failure(response);
  const reply = understood(stylePreviewReplySchema, await response.json());
  return { ...reply, src: `${api.origin}${reply.url}` };
}
