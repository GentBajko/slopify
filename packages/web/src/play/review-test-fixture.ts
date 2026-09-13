import { detectSlots } from "@app/slices/admission/substitute.js";
import type { Entry, Prompt } from "@app/slices/library/model.js";
import { toAdmissionDraft } from "@app/slices/play-drafts/convert.js";
import type { DraftView, PlayReview } from "@app/slices/play-drafts/model.js";
import { type Answer, jsonAnswer } from "@/test-app";

export function reviewFixture(
  view: DraftView,
  entries: readonly Entry[],
  prompts: readonly Prompt[],
): PlayReview {
  const documents = [
    view.draft.document,
    ...view.draft.document.variants.map((item) => ({
      ...view.draft.document,
      form: { ...view.draft.document.form, title: item.title, values: item.values },
    })),
  ];
  const runs = documents.flatMap((document) => {
    const converted = toAdmissionDraft({
      document,
      attachments: view.attachments,
      entries,
      silenceGapSeconds: 3,
    });
    if (!converted.ok) return [];
    const draft = converted.draft;
    const templates: Record<string, string> = {};
    if (draft.sources.article === "generate")
      templates.article =
        prompts.find((p) => p.kind === "article" && p.name === draft.articlePrompt)?.body ?? "";
    for (const picked of draft.imagePrompts)
      templates[`image.${picked.name}`] =
        prompts.find((p) => p.kind === "image" && p.name === picked.name)?.body ?? "";
    if (draft.thumbnailPrompt)
      templates.thumbnail =
        prompts.find((p) => p.kind === "thumbnail" && p.name === draft.thumbnailPrompt)?.body ?? "";
    for (const kind of ["intro", "outro"] as const)
      if (draft[kind])
        templates[kind] =
          entries.find((e) => e.category === kind && e.name === draft[kind]?.name)?.body ?? "";
    const slots = new Set(Object.values(templates).flatMap((text) => detectSlots(text).names));
    const values = Object.fromEntries(
      Object.entries(draft.values).filter(([key]) => slots.has(key)),
    );
    const rendered = Object.fromEntries(
      Object.entries(templates).map(([key, text]) => [
        key,
        text.replace(
          /\{\{\s*([^}]+?)\s*\}\}/g,
          (_match: string, slot: string) => values[slot] ?? "",
        ),
      ]),
    );
    return [{ draft: { ...draft, values }, rendered, templates }];
  });
  return {
    id: crypto.randomUUID(),
    draftId: view.draft.id,
    draftVersion: view.draft.version,
    fingerprint: "fixture",
    runs,
    estimates: runs.map(() => ({
      currency: "USD",
      rows: [],
      low: 0,
      high: 0,
      unknown: 0,
      expectedWords: Number(view.draft.document.expectedWords),
      catalogueDate: "2026-09-10",
      assumptions: [],
    })),
  };
}
export async function legacyFixtureStart(
  request: Request,
  review: PlayReview,
  answer: Answer,
  batch: boolean,
): Promise<Response> {
  const draft = review.runs[0]?.draft;
  const reply = await answer(
    new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        batch
          ? {
              draft,
              items: review.runs.map((run) => ({
                title: run.draft.title,
                values: run.draft.values,
              })),
            }
          : draft,
      ),
    }),
  );
  if (!reply.ok) return reply;
  const body = (await reply.json()) as {
    readonly project?: { readonly id: string };
    readonly queue?: readonly { readonly projectId: string }[];
  };
  return jsonAnswer({
    requestId: review.id,
    projectIds: body.project ? [body.project.id] : (body.queue?.map((row) => row.projectId) ?? []),
    queue: body.queue ?? [],
    replayed: false,
  })(request);
}
