import type { AppType } from "@app/edge/http/app.js";
import type {
  Project,
  ProjectListing,
  ProjectSummary,
  RunDraft,
  Stage,
} from "@app/slices/admission/model.js";
import type { FieldError } from "@app/slices/admission/rules.js";
import type {
  Entry,
  EntryCategory,
  EntryDraft,
  EntryMode,
  Prompt,
  PromptDraft,
  PromptKind,
} from "@app/slices/library/model.js";
import type {
  Appearance,
  AppSettings,
  ProviderFamily,
  ProviderId,
  ProviderStatus,
  Voice,
} from "@app/slices/settings/model.js";
import type { VoiceDraft } from "@app/slices/settings/voices.js";
import type { Output, StagedFile } from "@app/slices/storage/model.js";
import type { Usage } from "@app/slices/telemetry/usage.js";
import { hc } from "hono/client";
import type { Problem, SaveResult } from "./http.js";
import { errorOf, failure, problemOf, read, saved } from "./http.js";

export type {
  Appearance,
  AppSettings,
  Entry,
  EntryCategory,
  EntryDraft,
  EntryMode,
  FieldError,
  Output,
  Problem,
  Project,
  ProjectListing,
  ProjectSummary,
  Prompt,
  PromptDraft,
  PromptKind,
  ProviderFamily,
  ProviderId,
  ProviderStatus,
  RunDraft,
  SaveResult,
  Stage,
  StagedFile,
  Usage,
  Voice,
  VoiceDraft,
};

export type ApiClient = ReturnType<typeof hc<AppType>>;

// The stages whose content arrives as a file (slices/storage/model.ts).
export type UploadKind = "audio" | "images" | "thumbnail";

// The bodies the route handlers build, named from the same domain modules the handlers
// serialise. `InferResponseType` cannot be used for them: `problem()` is annotated
// `Response`, and a bare `Response` in a handler's union erases the JSON type of every
// route that can answer problem+json, which is every route with a validator.
export interface ProjectListBody {
  // A listing, not a summary: 07 Projects draws a meter per running row and the share it needs
  // is averaged server-side from the stage rows the list already reads
  // (`edge/http/projects.ts`).
  readonly projects: readonly ProjectListing[];
}
export interface ProjectBody {
  readonly project: ProjectSummary;
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
}
export interface CreatedProjectBody {
  readonly project: ProjectSummary;
  readonly stages: readonly Stage[];
}
export interface StagingListBody {
  readonly files: readonly StagedFile[];
}
export interface NoticeBody {
  readonly seen: boolean;
  // The version the notice names as the one that goes out in each report. Optional so a
  // server older than this bundle still answers something the SPA can read.
  readonly appVersion?: string;
}
export interface ProviderListBody {
  readonly providers: readonly ProviderStatus[];
}
export interface VoiceListBody {
  readonly voices: readonly Voice[];
}
// Every kind in one answer: 04 Prompts filters by tab and Duplicate needs the body it is
// copying, so `edge/http/prompts.ts` lists them all.
export interface PromptListBody {
  readonly prompts: readonly Prompt[];
}
// Both categories in one answer, for the same reason: 09 filters by tab and Duplicate
// needs the body it is copying (`edge/http/entries.ts`).
export interface EntryListBody {
  readonly entries: readonly Entry[];
}
// What a save answers with: that a key is stored and the mask, never the value
// (slices/settings/keys.ts).
export interface KeyStatusBody {
  readonly provider: ProviderId;
  readonly hasKey: boolean;
  readonly masked: string | null;
}

export interface Api {
  readonly client: ApiClient;
  // Uploads go through this rather than the typed client: the staging route reads its
  // multipart body off the socket with a streaming parser instead of a schema, so hono
  // has no request type for it. The URL still comes from the route type.
  readonly fetch: typeof fetch;
  // Where `/files/...` and the SSE endpoints live. They are served by URL, not through
  // the API.
  readonly origin: string;
}

export function createApi(origin: string, fetchImpl: typeof fetch): Api {
  return {
    client: hc<AppType>(`${origin}/api`, { fetch: fetchImpl }),
    fetch: fetchImpl,
    origin,
  };
}

export async function listProjects(api: Api): Promise<ProjectListBody> {
  return read<ProjectListBody>(await api.client.projects.$get());
}

export async function readProject(api: Api, id: string): Promise<ProjectBody> {
  return read<ProjectBody>(await api.client.projects[":id"].$get({ param: { id } }));
}

// A refused run is an expected outcome, not a fault: the server names every failing field
// and Play marks each one in place. So this answers with a value carrying the 400's
// `fields[]`, the way a refused template does. A creation that failed on this machine is
// still thrown, and the key shows it. A refusal is a problem+json the screen shows where
// the press happened; there is nothing to read back on success.
export async function removeProject(api: Api, id: string): Promise<void> {
  const response = await api.client.projects[":id"].$delete({ param: { id } });
  if (!response.ok) {
    throw await failure(response);
  }
}

export async function createProject(
  api: Api,
  draft: RunDraft,
): Promise<SaveResult<CreatedProjectBody>> {
  // RunDraft is `readonly`; hono's client asks for the mutable shape the route's schema
  // infers, and a structured clone is the honest way to hand it one.
  return saved<CreatedProjectBody>(
    await api.client.projects.$post({ json: JSON.parse(JSON.stringify(draft)) }),
  );
}

export async function listStaged(api: Api): Promise<StagingListBody> {
  return read<StagingListBody>(await api.client.staging.$get());
}

export async function uploadStaged(api: Api, kind: UploadKind, file: File): Promise<StagedFile> {
  const body = new FormData();
  body.set("file", file);
  const url = api.client.staging[":kind"].$url({ param: { kind } });
  return read<StagedFile>(await api.fetch(url, { method: "POST", body }));
}

export async function discardStaged(api: Api, id: string): Promise<void> {
  const response = await api.client.staging[":id"].$delete({ param: { id } });
  if (!response.ok) {
    throw await failure(response);
  }
}

// 10 Usage: this install's own numbers, computed from the local event log alone. Seconds of
// audio come back as seconds; the hours are the screen's.
export async function readUsage(api: Api): Promise<Usage> {
  return read<Usage>(await api.client.usage.$get());
}

export async function readNotice(api: Api): Promise<NoticeBody> {
  return read<NoticeBody>(await api.client.telemetry.notice.$get());
}

export async function dismissNotice(api: Api): Promise<NoticeBody> {
  return read<NoticeBody>(await api.client.telemetry.notice.$post());
}

// The URL of one of a project's files. `assetOf` in slices/storage/downloads.ts builds
// the same name from the output's role.
export function fileUrl(api: Api, projectId: string, asset: string): string {
  return `${api.origin}/files/${projectId}/${asset}`;
}

export async function listProviders(api: Api): Promise<ProviderListBody> {
  return read<ProviderListBody>(await api.client.providers.$get());
}

// The key crosses this function and is never handed back: the answer carries `hasKey`
// and the mask.
export async function saveProviderKey(
  api: Api,
  provider: ProviderId,
  key: string,
): Promise<KeyStatusBody> {
  return read<KeyStatusBody>(
    await api.client.providers[":id"].key.$put({ param: { id: provider }, json: { key } }),
  );
}

export async function removeProviderKey(api: Api, provider: ProviderId): Promise<void> {
  const response = await api.client.providers[":id"].key.$delete({ param: { id: provider } });
  if (!response.ok) {
    throw await failure(response);
  }
}

export async function readAppSettings(api: Api): Promise<AppSettings> {
  return read<AppSettings>(await api.client.settings.$get());
}

export async function saveAppSettings(api: Api, settings: AppSettings): Promise<AppSettings> {
  return read<AppSettings>(await api.client.settings.$put({ json: { ...settings } }));
}

export async function listVoices(api: Api): Promise<VoiceListBody> {
  return read<VoiceListBody>(await api.client.settings.voices.$get());
}

// Which input a refused voice belongs under. The names are the fields the add form
// draws, which are the names `edge/http/settings.ts` answers with.
export type VoiceField = "name" | "provider" | "voiceId";

export interface VoiceRefusal {
  readonly field: VoiceField;
  readonly message: string;
}

export type AddVoiceResult =
  | { readonly ok: true; readonly voice: Voice }
  | { readonly ok: false; readonly refusal: VoiceRefusal };

// A refused voice is an expected outcome, not a fault, so it comes back as a value the
// form can mark a field with. Everything else still throws.
export async function addVoice(api: Api, draft: VoiceDraft): Promise<AddVoiceResult> {
  const response = await api.client.settings.voices.$post({
    json: { provider: draft.provider, name: draft.name, voiceId: draft.voiceId },
  });
  if (response.ok) {
    return { ok: true, voice: (await response.json()) as Voice };
  }
  const problem = await problemOf(response);
  const refusal = refusalOf(response.status, problem);
  if (refusal !== undefined) {
    return { ok: false, refusal };
  }
  throw errorOf(response, problem);
}

export async function removeVoice(api: Api, id: string): Promise<void> {
  const response = await api.client.settings.voices[":id"].$delete({ param: { id } });
  if (!response.ok) {
    throw await failure(response);
  }
}

// A duplicate voice ID is a conflict with a row that exists, and the
// screen puts that sentence under the Voice ID input. A 400 names its own field.
function refusalOf(status: number, problem: Problem | undefined): VoiceRefusal | undefined {
  if (problem === undefined) {
    return undefined;
  }
  if (status === 409) {
    return { field: "voiceId", message: problem.detail ?? problem.title };
  }
  const named = problem.fields?.[0];
  if (status === 400 && named !== undefined && isVoiceField(named.field)) {
    return { field: named.field, message: named.message };
  }
  return undefined;
}

function isVoiceField(field: string): field is VoiceField {
  return field === "name" || field === "provider" || field === "voiceId";
}

export async function listPrompts(api: Api): Promise<PromptListBody> {
  return read<PromptListBody>(await api.client.prompts.$get());
}

export async function savePrompt(
  api: Api,
  draft: PromptDraft,
  id: string | undefined,
): Promise<SaveResult<Prompt>> {
  const json = { kind: draft.kind, name: draft.name, body: draft.body };
  return saved<Prompt>(
    id === undefined
      ? await api.client.prompts.$post({ json })
      : await api.client.prompts[":id"].$put({ param: { id }, json }),
  );
}

export async function removePrompt(api: Api, id: string): Promise<void> {
  const response = await api.client.prompts[":id"].$delete({ param: { id } });
  if (!response.ok) {
    throw await failure(response);
  }
}

export async function listEntries(api: Api): Promise<EntryListBody> {
  return read<EntryListBody>(await api.client.entries.$get());
}

export async function saveEntry(
  api: Api,
  draft: EntryDraft,
  id: string | undefined,
): Promise<SaveResult<Entry>> {
  const json = { category: draft.category, mode: draft.mode, name: draft.name, body: draft.body };
  return saved<Entry>(
    id === undefined
      ? await api.client.entries.$post({ json })
      : await api.client.entries[":id"].$put({ param: { id }, json }),
  );
}

export async function removeEntry(api: Api, id: string): Promise<void> {
  const response = await api.client.entries[":id"].$delete({ param: { id } });
  if (!response.ok) {
    throw await failure(response);
  }
}

export function eventsUrl(api: Api, path: string): string {
  return `${api.origin}/api/events/${path}`;
}
