import type { NarrationPeaks } from "@app/slices/narration/peaks-model.js";
import {
  type FirstRunView,
  type SampleProjects,
  type ShortGap,
  shortGapSchema,
} from "@app/slices/onboarding/model.js";
import { z } from "zod";
import type { Api } from "@/api";
import { errorOf, problemOf, read } from "@/http";

// The first five minutes' endpoints (`edge/http/onboarding.ts`). Every refusal is the
// server's own sentence, which names the screen that fixes it.

export type { FirstRunView, SampleProjects, ShortGap };

export const onboardingKey = ["onboarding"] as const;
export const sampleKey = ["onboarding", "sample"] as const;
export const peaksKey = (projectId: string, revisionId: string | null) =>
  ["narration-peaks", projectId, revisionId] as const;

const post = (api: Api, path: string, body?: unknown): Promise<Response> =>
  api.fetch(`${api.origin}/api/onboarding${path}`, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });

export async function readFirstRun(api: Api): Promise<FirstRunView> {
  return read<FirstRunView>(await api.fetch(`${api.origin}/api/onboarding`));
}

// The checklist's Check again: the same view, after a fresh look for a speech program.
export async function checkFirstRun(api: Api): Promise<FirstRunView> {
  return read<FirstRunView>(await post(api, "/check"));
}

// Skip, Done, or a real project made elsewhere. It also answers "Start Slopify when I log in"
// as No, so the question is never put to a fresh install in a dialog over Home.
export async function dismissFirstRun(api: Api): Promise<void> {
  await read<unknown>(await post(api, "/dismiss"));
}

export interface InstalledPack {
  readonly packId: string;
  readonly added: boolean;
  readonly templateId: string | null;
}

export async function installPack(api: Api, packId: string): Promise<InstalledPack> {
  return read<InstalledPack>(await post(api, `/packs/${encodeURIComponent(packId)}`));
}

// A short started, or refused for what this computer lacks: each gap with what fixes it, as
// the first-run checklist says it. Any other failure throws its sentence.
export type ShortResult =
  | { readonly ok: true; readonly projectId: string }
  | { readonly ok: false; readonly gaps: readonly ShortGap[] };

export async function makeShort(
  api: Api,
  input: { readonly topic: string; readonly packId?: string; readonly requestId: string },
): Promise<ShortResult> {
  const response = await post(api, "/short", input);
  if (response.ok) {
    const { projectId } = (await response.json()) as { projectId: string };
    return { ok: true, projectId };
  }
  const problem = await problemOf(response);
  const gaps = z
    .array(shortGapSchema)
    .safeParse((problem as { readonly gaps?: unknown } | undefined)?.gaps);
  if (response.status === 409 && gaps.success && gaps.data.length > 0)
    return { ok: false, gaps: gaps.data };
  throw errorOf(response, problem);
}

// A finished short's "Make the full video on this topic": a Play draft for the long video.
// `draftId` is the caller's, so a retried press opens the same draft.
export async function fullVideoDraft(
  api: Api,
  input: { readonly projectId: string; readonly draftId: string },
): Promise<{ readonly draft: { readonly id: string } }> {
  return read<{ draft: { id: string } }>(await post(api, "/full-video", input));
}

export interface SampleState {
  // The Library of Alexandria's project; `samples` has all three.
  readonly projectId: string | null;
  readonly samples: SampleProjects;
}

export async function readSample(api: Api): Promise<SampleState> {
  return read<SampleState>(await api.fetch(`${api.origin}/api/onboarding/sample`));
}

// Whether a project is one of the bundled samples.
export function isSample(state: SampleState | undefined, projectId: string): boolean {
  return state !== undefined && Object.values(state.samples).includes(projectId);
}

export async function restoreSample(api: Api): Promise<SampleState> {
  return read<SampleState>(await post(api, "/sample/restore"));
}

// Make my own copy of one sample. Without a project it copies the sample whose page is open
// (the project in the address), else the Library of Alexandria.
export async function copySample(
  api: Api,
  projectId: string | undefined = openProject(),
): Promise<{ readonly projectId: string }> {
  return read<{ projectId: string }>(
    await post(api, "/sample/copy", projectId === undefined ? undefined : { projectId }),
  );
}

function openProject(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const match = /\/projects\/([^/?#]+)/.exec(window.location.pathname);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

export async function readPeaks(
  api: Api,
  projectId: string,
): Promise<NarrationPeaks | { readonly revisionId: null; readonly pieces: [] }> {
  return read(
    await api.fetch(`${api.origin}/api/projects/${encodeURIComponent(projectId)}/narration/peaks`),
  );
}
