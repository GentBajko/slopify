import {
  type TutorialView,
  type TutorialWrite,
  tutorialSessionSchema,
} from "@app/slices/settings/tutorial-schema.js";
import { z } from "zod";
import type { Api } from "@/api";
import { failure, read } from "@/http";

const viewSchema = z
  .object({
    version: z.number().int().nonnegative(),
    session: tutorialSessionSchema,
    readable: z.boolean(),
  })
  .strict();
export async function readTutorialSession(api: Api): Promise<TutorialView> {
  const raw = await read<unknown>(await api.client.tutorial.$get());
  const parsed = viewSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return {
    version: 0,
    readable: false,
    session: { schemaVersion: 1, active: false, stepId: "text-key" },
  };
}
export async function saveTutorialSession(api: Api, input: TutorialWrite): Promise<TutorialView> {
  return viewSchema.parse(await read<unknown>(await api.client.tutorial.$put({ json: input })));
}
export async function resetTutorialSession(api: Api): Promise<void> {
  const response = await api.client.tutorial.$delete();
  if (!response.ok) throw await failure(response);
}
