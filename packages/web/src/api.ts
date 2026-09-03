import type { AppType } from "@app/edge/http/app.js";
import type { Project, ProjectSummary, RunDraft, Stage } from "@app/slices/admission/model.js";
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
import { hc } from "hono/client";

export type {
  Appearance,
  AppSettings,
  Entry,
  EntryCategory,
  EntryDraft,
  EntryMode,
  FieldError,
  Output,
  Project,
  ProjectSummary,
  Prompt,
  PromptDraft,
  PromptKind,
  ProviderFamily,
  ProviderId,
  ProviderStatus,
  RunDraft,
  Stage,
  StagedFile,
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
  readonly projects: readonly ProjectSummary[];
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
}
export interface ProviderListBody {
  readonly providers: readonly ProviderStatus[];
}
export interface VoiceListBody {
  readonly voices: readonly Voice[];
}
// Every kind in one answer: 04 Prompts filters by tab and Duplicate needs the body it is
// copying, so `edge/http/prompts.ts` lists them all (`logic/15` step 3).
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

// RFC 9457 as `edge/http/problem.ts` writes it, with the `fields` extension member the
// admission rules add (logic/04 §Q29).
export interface Problem {
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly fields?: readonly FieldError[];
}

export interface Api {
  readonly client: ApiClient;
  // Uploads go through this rather than the typed client: the staging route reads its
  // multipart body off the socket with a streaming parser instead of a schema, so hono
  // has no request type for it. The URL still comes from the route type.
  readonly fetch: typeof fetch;
  // Where `/files/...` and the SSE endpoints live. They are served by URL, not through
  // the API (02-models Boundaries).
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

export async function createProject(api: Api, draft: RunDraft): Promise<CreatedProjectBody> {
  // RunDraft is `readonly`; hono's client asks for the mutable shape the route's schema
  // infers, and a structured clone is the honest way to hand it one.
  return read<CreatedProjectBody>(
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
// and the mask (`logic/02` invariants).
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
// form can mark a field with (03-standards, typed results). Everything else still throws.
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

// `logic/02` §Q18: a duplicate voice ID is a conflict with a row that exists, and the
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

// A refused template is an expected outcome, so it comes back as a value carrying the
// server's own `fields[]` for the editor to mark (03-standards, typed results). One type
// for prompts and entries, because `logic/15` §Q121 gives them one rule set and
// `edge/http/entries.ts` reuses the prompt routes' refusal mapping.
export type SaveResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly fields: readonly FieldError[] };

// `id` undefined creates; anything else replaces (`logic/15` §Q125: a save overwrites).
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

async function saved<T>(response: Response): Promise<SaveResult<T>> {
  if (response.ok) {
    return { ok: true, value: (await response.json()) as T };
  }
  const problem = await problemOf(response);
  const fields = problem?.fields ?? [];
  // 400 marks the lint that got past the editor, 409 the name the unique index refused
  // (`logic/15` §Q122). Both name their fields; anything else is a fault and throws.
  if ((response.status === 400 || response.status === 409) && fields.length > 0) {
    return { ok: false, fields };
  }
  throw errorOf(response, problem);
}

export function eventsUrl(api: Api, path: string): string {
  return `${api.origin}/api/events/${path}`;
}

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await failure(response);
  }
  return (await response.json()) as T;
}

// React Query's error channel is an Error, so an expected failure crosses into it as
// one. The problem's own `detail` is the sentence the server wrote for the user; nothing
// is invented here and nothing is swallowed.
async function failure(response: Response): Promise<Error> {
  return errorOf(response, await problemOf(response));
}

// Split from `failure` so a caller that already read the problem document to decide
// whether the outcome was expected can still raise the same error for one that was not:
// a response body may be read only once.
function errorOf(response: Response, problem: Problem | undefined): Error {
  if (problem === undefined) {
    return new Error(`The app answered ${response.status} with no problem document.`);
  }
  const fields = problem.fields ?? [];
  const listed = fields.map((field) => `${field.field}: ${field.message}`).join("; ");
  const detail = problem.detail ?? problem.title;
  return new Error(listed === "" ? detail : `${detail} ${listed}`);
}

async function problemOf(response: Response): Promise<Problem | undefined> {
  if (!(response.headers.get("content-type") ?? "").includes("problem+json")) {
    return undefined;
  }
  return (await response.json()) as Problem;
}
