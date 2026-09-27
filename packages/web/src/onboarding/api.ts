import type { NarrationPeaks } from "@app/slices/narration/peaks-model.js";
import type { FirstRunView, SampleProjects } from "@app/slices/onboarding/model.js";
import type { Api } from "@/api";
import { read } from "@/http";

// The first five minutes' endpoints (`edge/http/onboarding.ts`). Every refusal is the
// server's own sentence, which names the screen that fixes it.

export type { FirstRunView, SampleProjects };

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

export async function makeShort(
  api: Api,
  input: { readonly topic: string; readonly packId?: string; readonly requestId: string },
): Promise<{ readonly projectId: string }> {
  return read<{ projectId: string }>(await post(api, "/short", input));
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

export async function copySample(
  api: Api,
  projectId?: string,
): Promise<{ readonly projectId: string }> {
  return read<{ projectId: string }>(
    await post(api, "/sample/copy", projectId === undefined ? undefined : { projectId }),
  );
}

export async function readPeaks(
  api: Api,
  projectId: string,
): Promise<NarrationPeaks | { readonly revisionId: null; readonly pieces: [] }> {
  return read(
    await api.fetch(`${api.origin}/api/projects/${encodeURIComponent(projectId)}/narration/peaks`),
  );
}
