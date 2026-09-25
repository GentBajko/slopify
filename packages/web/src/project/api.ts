import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProviderChoice, VoiceChoice } from "@app/slices/admission/model.js";
import {
  type RevisionControlInput,
  revisionControlSchema,
} from "@app/slices/control/revision-control-schema.js";
import { type RecoveryResult, recoveryResultSchema } from "@app/slices/rebuild/recovery-model.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import type { Api, ProjectBody } from "@/api";
import { fileUrl } from "@/api";
import { errorOf, problemOf, readText, unrecognised } from "@/http";

// Control responses may be replayed receipts for an older revision. Callers refetch
// the current project instead of publishing these projections into the current cache.

export interface ActionBody extends ProjectBody {
  // The stages the cascade put back to `pending`, or the ones a
  // cancel stopped. Carried through so a caller can say what moved.
  readonly redone?: readonly StageKind[];
  readonly canceled?: readonly StageKind[];
}

// A refused action is an expected outcome the page shows, not a fault: every one is a
// refusal with a sentence the server wrote. Anything else still throws.
export type ActionResult =
  | { readonly ok: true; readonly value: ActionBody }
  | { readonly ok: false; readonly message: string };

// The statuses `edge/http/actions.ts` maps its `RerunRefusal` set onto. Everything else
// is a fault: a 500 is not a sentence for the user to act on.
const refusals: ReadonlySet<number> = new Set([400, 404, 409]);

export async function cancelRun(
  api: Api,
  projectId: string,
  input: RevisionControlInput,
): Promise<ActionResult> {
  return controlRun(api, projectId, "cancel", input);
}

export interface ProviderChanges {
  readonly chunking?: import("@app/slices/narration/chunk.js").Chunking;
  readonly llm?: ProviderChoice;
  readonly audio?: VoiceChoice;
  readonly images?: ProviderChoice;
}

export async function pauseRun(
  api: Api,
  projectId: string,
  input: RevisionControlInput,
): Promise<ActionResult> {
  return controlRun(api, projectId, "pause", input);
}

export type RecoveryActionResult =
  | {
      readonly ok: true;
      readonly value: Extract<RecoveryResult, { ok: true }>["value"];
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly message: string };

export function resumeRun(
  api: Api,
  projectId: string,
  input: RevisionControlInput,
): Promise<RecoveryActionResult> {
  return recoveryRun(api, projectId, "resume", input);
}

export function retryStage(
  api: Api,
  projectId: string,
  kind: StageKind,
  input: RevisionControlInput,
): Promise<RecoveryActionResult> {
  return recoveryRun(api, projectId, `stages/${kind}/retry`, input);
}

export function rerunStage(
  api: Api,
  projectId: string,
  kind: StageKind,
  input: RevisionControlInput,
): Promise<RecoveryActionResult> {
  return recoveryRun(api, projectId, `stages/${kind}/rerun`, input);
}

export async function updateProviders(
  api: Api,
  projectId: string,
  choices: ProviderChanges,
): Promise<ActionResult> {
  return acted(
    await api.fetch(`${api.origin}/api/projects/${encodeURIComponent(projectId)}/providers`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(choices),
    }),
  );
}

export async function updateSubtitles(
  api: Api,
  projectId: string,
  subtitles: SubtitleConfig,
): Promise<ActionResult> {
  return acted(
    await api.fetch(`${api.origin}/api/projects/${encodeURIComponent(projectId)}/subtitles`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subtitles),
    }),
  );
}

export async function saveArticle(
  api: Api,
  projectId: string,
  markdown: string,
): Promise<ActionResult> {
  return acted(
    await api.fetch(`${api.origin}/api/projects/${encodeURIComponent(projectId)}/article`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown }),
    }),
  );
}

export async function deleteImage(
  api: Api,
  projectId: string,
  outputId: string,
): Promise<ActionResult> {
  return acted(
    await api.client.projects[":id"].images[":outputId"].$delete({
      param: { id: projectId, outputId },
    }),
  );
}

export async function regenerateImage(
  api: Api,
  projectId: string,
  outputId: string,
): Promise<ActionResult> {
  return acted(
    await api.client.projects[":id"].images[":outputId"].regenerate.$post({
      param: { id: projectId, outputId },
    }),
  );
}

// The research notes, the article, the sources and glossary, and each stage's
// instructions. They are files, so they come from `/files/...` rather than the API.
export async function readOutputText(api: Api, projectId: string, asset: string): Promise<string> {
  return readText(await api.fetch(fileUrl(api, projectId, asset)));
}

async function acted(response: Response): Promise<ActionResult> {
  if (response.ok) {
    return { ok: true, value: (await response.json()) as ActionBody };
  }
  const problem = await problemOf(response);
  if (problem !== undefined && refusals.has(response.status)) {
    // The server's own sentence, verbatim: it names the rule and, for the last image,
    // the reason the file survives.
    return { ok: false, message: errorOf(response, problem).message };
  }
  throw errorOf(response, problem);
}

async function controlRun(
  api: Api,
  projectId: string,
  kind: "pause" | "cancel",
  input: RevisionControlInput,
): Promise<ActionResult> {
  const body = revisionControlSchema.parse(input);
  return acted(
    await api.fetch(`${api.origin}/api/projects/${encodeURIComponent(projectId)}/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function recoveryRun(
  api: Api,
  projectId: string,
  path: string,
  input: RevisionControlInput,
): Promise<RecoveryActionResult> {
  const response = await api.fetch(
    `${api.origin}/api/projects/${encodeURIComponent(projectId)}/${path}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(revisionControlSchema.parse(input)),
    },
  );
  if (response.ok) {
    const result = recoveryResultSchema.parse(await response.json());
    if (!result.ok) throw new Error(unrecognised);
    return { ok: true, value: result.value, warnings: result.value.warnings };
  }
  const problem = await problemOf(response);
  if (problem !== undefined && refusals.has(response.status))
    return { ok: false, message: errorOf(response, problem).message };
  throw errorOf(response, problem);
}
