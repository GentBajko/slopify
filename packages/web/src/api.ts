import type { AppType } from "@app/edge/http/app.js";
import type { NarrationAlias } from "@app/kernel/ports/narration-aliases.js";
import type {
  Project,
  ProjectListing,
  ProjectSummary,
  RunDraft,
  SharedPronunciation,
  Stage,
} from "@app/slices/admission/model.js";
import type { FieldError } from "@app/slices/admission/rules.js";
import type { BackupConfigInput, BackupView } from "@app/slices/backups/model.js";
import type { DocumentThemeName, SavedDocumentTheme } from "@app/slices/document/model.js";
import type { DocumentTheme } from "@app/slices/document/theme.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import type { LibraryItemKind, LibraryVersion } from "@app/slices/library/history.js";
import type {
  Entry,
  EntryCategory,
  EntryDraft,
  EntryMode,
  Prompt,
  PromptDraft,
  PromptKind,
} from "@app/slices/library/model.js";
import type { UsedBy } from "@app/slices/library/used-by.js";
import type { RunCost } from "@app/slices/run-cost/panel.js";
import type {
  Appearance,
  AppSettings,
  ProviderFamily,
  ProviderId,
  ProviderStatus,
  Voice,
} from "@app/slices/settings/model.js";
import type { VoiceDraft } from "@app/slices/settings/voices.js";
import type { BackupImportSummary } from "@app/slices/storage/backup-import.js";
import type { FilesView } from "@app/slices/storage/files-location.js";
import type { Output, StagedFile } from "@app/slices/storage/model.js";
import type {
  FillQueueItem,
  StudioExtensionBrowser,
  StudioPairingView,
  UploadPack,
} from "@app/slices/studio/model.js";
import type { Usage } from "@app/slices/telemetry/usage.js";
import type { DescriptionField } from "@app/slices/youtube/edits.js";
import type { ProjectDescriptionEdits } from "@app/slices/youtube/edits-repo.js";
import type { ChannelLink } from "@app/slices/youtube/placeholders.js";
import { hc } from "hono/client";
import type { Problem, SaveResult } from "./http.js";
import { errorOf, failure, problemOf, reachingFetch, read, saved, unreachable } from "./http.js";

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
  readonly revisionId: string | null;
  // Unfinished work on the saved revision that nothing has admitted or will dispatch
  // (`slices/rebuild/recovery-repo.ts`): Resume is the way on even while status says pending.
  readonly resumable: boolean;
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
export interface StorageUsage {
  readonly data: number;
  readonly projects: number;
  readonly staging: number;
  // Projects in Settings → Trash. `projects` still counts their folders until the trash
  // removes them for good.
  readonly trash: { readonly projects: number; readonly bytes: number };
  readonly byProject: readonly {
    readonly id: string;
    readonly title: string;
    readonly bytes: number;
    // What gets published, and what the project was made from (slices/storage/trim.ts).
    readonly outputsBytes: number;
    readonly workingBytes: number;
    readonly removableFiles: number;
    readonly removableBytes: number;
    readonly finished: boolean;
  }[];
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
// copying, so `edge/http/prompts.ts` lists them all. An Image prompt marked photorealistic
// says so (`slices/library/photorealistic.ts`).
export interface PromptListBody {
  readonly prompts: readonly (Prompt & { readonly photorealistic?: true | undefined })[];
}
// Both categories in one answer, for the same reason: 09 filters by tab and Duplicate
// needs the body it is copying (`edge/http/entries.ts`).
export interface EntryListBody {
  readonly entries: readonly Entry[];
}
// Library → Documents: the built-ins with their values (Duplicate starts from them) and
// every saved theme (`edge/http/document-themes.ts`).
export interface DocumentThemeListBody {
  readonly builtIns: readonly {
    readonly name: DocumentThemeName;
    readonly label: string;
    readonly values: DocumentTheme;
  }[];
  readonly themes: readonly SavedDocumentTheme[];
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
  // A PUT of one large file that reports how much of it has been sent (a backup can be
  // gigabytes). fetch cannot report upload progress, so the page wires an XHR in here.
  readonly upload: Upload;
}

export type UploadProgress = (sent: number, total: number) => void;
export type Upload = (
  url: string,
  body: Blob,
  contentType: string,
  onProgress: UploadProgress,
) => Promise<Response>;

export function createApi(origin: string, fetchImpl: typeof fetch, upload?: Upload): Api {
  const reaching = reachingFetch(fetchImpl);
  return {
    client: hc<AppType>(`${origin}/api`, { fetch: reaching }),
    fetch: reaching,
    origin,
    upload: upload ?? fetchUpload(reaching),
  };
}

// Without XHR there is no progress to report until the answer: the whole file is sent.
function fetchUpload(fetchImpl: typeof fetch): Upload {
  return async (url, body, contentType, onProgress) => {
    const response = await fetchImpl(url, {
      method: "PUT",
      headers: { "content-type": contentType },
      body,
    });
    onProgress(body.size, body.size);
    return response;
  };
}

export function xhrUpload(onResponse: (response: Response) => void = () => {}): Upload {
  return (url, body, contentType, onProgress) =>
    new Promise<Response>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", url);
      request.setRequestHeader("content-type", contentType);
      request.upload.onprogress = (event) => {
        onProgress(event.loaded, event.lengthComputable ? event.total : body.size);
      };
      request.onload = () => {
        const headers = new Headers();
        for (const line of request
          .getAllResponseHeaders()
          .trim()
          .split(/[\r\n]+/)) {
          const at = line.indexOf(":");
          if (at > 0) headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
        }
        const response = new Response(request.responseText, { status: request.status, headers });
        onResponse(response);
        resolve(response);
      };
      request.onerror = () => {
        reject(new TypeError(unreachable()));
      };
      request.send(body);
    });
}

export type { BackupImportSummary };

export interface BackupExportSummary {
  readonly ready: boolean;
  readonly projects?: number;
  readonly files?: number;
  readonly bytes?: number;
  readonly detail?: string;
}

export async function readBackupExportSummary(api: Api): Promise<BackupExportSummary> {
  return read<BackupExportSummary>(await api.fetch(`${api.origin}/api/storage/export/summary`));
}

export async function readBackups(api: Api): Promise<BackupView> {
  return read<BackupView>(await api.client.backups.$get());
}

export async function saveBackups(api: Api, config: BackupConfigInput): Promise<BackupView> {
  return read<BackupView>(await api.client.backups.$put({ json: { ...config } }));
}

// Starts writing a backup and answers at once; Settings → Backups polls readBackups for the result.
export async function runBackupNow(api: Api): Promise<BackupView> {
  return read<BackupView>(await api.client.backups.run.$post());
}

export async function listProjects(api: Api): Promise<ProjectListBody> {
  return read<ProjectListBody>(await api.client.projects.$get());
}

export async function readProject(api: Api, id: string): Promise<ProjectBody> {
  return read<ProjectBody>(await api.client.projects[":id"].$get({ param: { id } }));
}

// The Run cost tab and the "Waiting for … limits" line (`edge/http/run-cost.ts`).
export async function readRunCost(api: Api, id: string): Promise<RunCost> {
  return read<RunCost>(await api.client.projects[":id"]["run-cost"].$get({ param: { id } }));
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

export async function readStorageUsage(api: Api): Promise<StorageUsage> {
  return read<StorageUsage>(await api.fetch(`${api.origin}/api/storage`));
}

export type { FilesView };

// Settings → Backup & storage → Your files (`edge/http/storage-files.ts`).
export async function readFiles(api: Api): Promise<FilesView> {
  return read<FilesView>(await api.fetch(`${api.origin}/api/storage/files`));
}

// Starts copying the files to "documents" (<Documents>/Slopify) or a full folder path; answers
// at once and the screen polls readFiles for the progress.
export async function moveFiles(api: Api, target: string): Promise<FilesView> {
  return read<FilesView>(
    await api.fetch(`${api.origin}/api/storage/files/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target }),
    }),
  );
}

export async function openFilesFolder(
  api: Api,
): Promise<{ readonly opened: boolean; readonly path: string }> {
  return read<{ readonly opened: boolean; readonly path: string }>(
    await api.fetch(`${api.origin}/api/storage/files/open`, { method: "POST" }),
  );
}

// Keep outputs only: a finished project drops the working files it was made from.
export async function keepOutputsOnly(
  api: Api,
  projectId: string,
): Promise<{ readonly files: number; readonly bytesFreed: number }> {
  return read<{ readonly files: number; readonly bytesFreed: number }>(
    await api.fetch(
      `${api.origin}/api/storage/projects/${encodeURIComponent(projectId)}/keep-outputs`,
      { method: "POST" },
    ),
  );
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

export async function saveProviderPath(
  api: Api,
  provider: ProviderId,
  path: string,
): Promise<ProviderStatus> {
  return read<ProviderStatus>(
    await api.client.providers[":id"].path.$put({ param: { id: provider }, json: { path } }),
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

export interface NotificationUrlBody {
  readonly url: string | null;
}

export async function readNotificationUrl(api: Api): Promise<NotificationUrlBody> {
  return read<NotificationUrlBody>(await api.client.settings.notifications.$get());
}

// A refusal's `detail` already names the field, the reason and the control, so it is the
// whole sentence; the fields list would only repeat it.
async function detailed<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const problem = await problemOf(response);
  throw problem?.detail === undefined ? errorOf(response, problem) : new Error(problem.detail);
}

export async function saveNotificationUrl(api: Api, url: string): Promise<NotificationUrlBody> {
  return detailed<NotificationUrlBody>(
    await api.client.settings.notifications.$put({ json: { url } }),
  );
}

export async function sendTestNotification(api: Api, url: string): Promise<void> {
  await detailed<{ sent: boolean }>(
    await api.client.settings.notifications.test.$post({ json: { url } }),
  );
}

// Settings → YouTube Studio: the default playlist, each channel's own, and the extension's
// pairing.
export interface StudioSettingsBody {
  readonly playlist: string | null;
  // By channel id; a channel missing here uses `playlist`.
  readonly channelPlaylists: Readonly<Record<string, string>>;
  readonly pairing: StudioPairingView;
}

export async function readStudioSettings(api: Api): Promise<StudioSettingsBody> {
  return read<StudioSettingsBody>(await api.client.studio.settings.$get());
}

// The default playlist, or a channel's own when `channelId` is given.
export async function saveStudioPlaylist(
  api: Api,
  playlist: string,
  channelId?: string,
): Promise<{ readonly playlist: string | null }> {
  return detailed(
    await api.client.studio.settings.playlist.$put({
      json: channelId === undefined ? { playlist } : { playlist, channelId },
    }),
  );
}

// Where Settings' and Prepare upload's Download fetch the extension from.
export function studioExtensionUrl(api: Api, browser: StudioExtensionBrowser): string {
  return `${api.origin}/api/studio/extension/${browser}.zip`;
}

// What waits for the extension, oldest first.
export async function readStudioQueue(api: Api): Promise<readonly FillQueueItem[]> {
  return (await read<{ queue: readonly FillQueueItem[] }>(await api.client.studio.queue.$get()))
    .queue;
}

export async function removeFromStudioQueue(
  api: Api,
  projectId: string,
  short: number | null,
): Promise<readonly FillQueueItem[]> {
  return (
    await detailed<{ queue: readonly FillQueueItem[] }>(
      await api.client.studio.queue.remove.$post({ json: { projectId, short } }),
    )
  ).queue;
}

export async function newStudioPairing(api: Api): Promise<{ readonly pairing: StudioPairingView }> {
  return detailed(await api.client.studio.settings.pairing.$post());
}

export async function readUploadPack(api: Api, projectId: string): Promise<UploadPack> {
  return detailed<UploadPack>(
    await api.client.studio.packs[":projectId"].$get({ param: { projectId } }),
  );
}

// Prepare upload's AI use tick: the project's uploaded clips are real footage. Answers the pack
// as it now reads.
export async function saveRealFootage(
  api: Api,
  projectId: string,
  realFootage: boolean,
): Promise<UploadPack> {
  return detailed<UploadPack>(
    await api.client.studio.packs[":projectId"]["real-footage"].$put({
      param: { projectId },
      json: { realFootage },
    }),
  );
}

// Puts this pack item in the queue the Studio extension fills from, one upload dialog each;
// answers the queue as it now is.
export async function chooseUploadPack(
  api: Api,
  projectId: string,
  short: number | undefined,
): Promise<readonly FillQueueItem[]> {
  const answer = await detailed<{ queue?: readonly FillQueueItem[] }>(
    await api.client.studio.packs[":projectId"].choose.$post({
      param: { projectId },
      json: short === undefined ? {} : { short },
    }),
  );
  return answer.queue ?? [];
}

export async function listVoices(api: Api): Promise<VoiceListBody> {
  return read<VoiceListBody>(await api.client.settings.voices.$get());
}

// Which input a refused voice belongs under. The names are the fields the add form
// draws, which are the names `edge/http/settings.ts` answers with.
export type VoiceField = "name" | "provider" | "voiceId" | "languages";

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
    json: {
      provider: draft.provider,
      name: draft.name,
      voiceId: draft.voiceId,
      ...(draft.languages === undefined ? {} : { languages: [...draft.languages] }),
    },
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

// Settings → Voices' own list for a saved voice; an empty list is unknown (every language).
export async function setVoiceLanguages(
  api: Api,
  id: string,
  languages: readonly string[],
): Promise<VoiceRefusal | undefined> {
  const response = await api.client.settings.voices[":id"].languages.$put({
    param: { id },
    json: { languages: [...languages] },
  });
  if (response.ok) return undefined;
  const problem = await problemOf(response);
  const refusal = refusalOf(response.status, problem);
  if (refusal !== undefined) return refusal;
  throw errorOf(response, problem);
}

// Settings → Voices' "Imitates a real person" switch, which makes the voice's narration answer
// Yes to YouTube's AI use.
export async function setVoiceImitatesRealPerson(
  api: Api,
  id: string,
  imitatesRealPerson: boolean,
): Promise<void> {
  const response = await api.client.settings.voices[":id"]["real-person"].$put({
    param: { id },
    json: { imitatesRealPerson },
  });
  if (!response.ok) throw await failure(response);
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
  return field === "name" || field === "provider" || field === "voiceId" || field === "languages";
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

// An Image prompt's "Draws photorealistic pictures" switch, which applies at once.
export async function setPromptPhotorealistic(
  api: Api,
  id: string,
  photorealistic: boolean,
): Promise<void> {
  const response = await api.client.prompts[":id"].photorealistic.$put({
    param: { id },
    json: { photorealistic },
  });
  if (!response.ok) throw await failure(response);
}

export async function removePrompt(api: Api, id: string): Promise<void> {
  const response = await api.client.prompts[":id"].$delete({ param: { id } });
  if (!response.ok) {
    throw await failure(response);
  }
}

export type {
  ChannelLink,
  DescriptionField,
  LibraryItemKind,
  LibraryVersion,
  ProjectDescriptionEdits,
  UsedBy,
};

// Settings → Channel links: the named links `{{Name}}` fills from in YouTube descriptions.
export async function readChannelLinks(api: Api): Promise<readonly ChannelLink[]> {
  return (
    await read<{ links: readonly ChannelLink[] }>(await api.client.settings["channel-links"].$get())
  ).links;
}

export async function saveChannelLinks(
  api: Api,
  links: readonly ChannelLink[],
): Promise<readonly ChannelLink[]> {
  return (
    await read<{ links: readonly ChannelLink[] }>(
      await api.client.settings["channel-links"].$put({ json: { links: [...links] } }),
    )
  ).links;
}

// The project page's hand edits to the YouTube description (`slices/youtube/edits.ts`).
export async function readDescriptionEdits(
  api: Api,
  projectId: string,
): Promise<ProjectDescriptionEdits> {
  return read<ProjectDescriptionEdits>(
    await api.client.projects[":id"]["youtube-edits"].$get({ param: { id: projectId } }),
  );
}

// Saves the user's text for a field with the generated text it was made from; `null` drops the
// edit, so the field follows the generated text again.
export async function saveDescriptionEdit(
  api: Api,
  projectId: string,
  field: DescriptionField,
  edit: { readonly text: string; readonly base: string } | null,
): Promise<ProjectDescriptionEdits> {
  const param = { id: projectId, field };
  return read<ProjectDescriptionEdits>(
    edit === null
      ? await api.client.projects[":id"]["youtube-edits"].fields[":field"].$delete({ param })
      : await api.client.projects[":id"]["youtube-edits"].fields[":field"].$put({
          param,
          json: { text: edit.text, base: edit.base },
        }),
  );
}

export async function saveProjectLinks(
  api: Api,
  projectId: string,
  links: readonly ChannelLink[],
): Promise<ProjectDescriptionEdits> {
  return read<ProjectDescriptionEdits>(
    await api.client.projects[":id"]["youtube-edits"].links.$put({
      param: { id: projectId },
      json: { links: [...links] },
    }),
  );
}

export interface LibraryHistoryBody {
  readonly versions: readonly LibraryVersion[];
}

// History and Used by for one Library prompt or intro/outro (`slices/library/history.ts`,
// `slices/library/used-by.ts`).
export async function readLibraryHistory(
  api: Api,
  item: LibraryItemKind,
  id: string,
): Promise<LibraryHistoryBody> {
  const param = { param: { id } };
  return read<LibraryHistoryBody>(
    item === "prompt"
      ? await api.client.prompts[":id"].history.$get(param)
      : await api.client.entries[":id"].history.$get(param),
  );
}

export async function readLibraryUsedBy(
  api: Api,
  item: LibraryItemKind,
  id: string,
): Promise<UsedBy> {
  const param = { param: { id } };
  return read<UsedBy>(
    item === "prompt"
      ? await api.client.prompts[":id"]["used-by"].$get(param)
      : await api.client.entries[":id"]["used-by"].$get(param),
  );
}

// Restore saves the old version again as a new one. A name another item took since is the one
// refusal the user can fix, so it is said in those terms.
export async function restoreLibraryVersion(
  api: Api,
  item: LibraryItemKind,
  id: string,
  version: number,
): Promise<void> {
  const param = { param: { id, version: String(version) } };
  const response =
    item === "prompt"
      ? await api.client.prompts[":id"].history[":version"].restore.$post(param)
      : await api.client.entries[":id"].history[":version"].restore.$post(param);
  if (response.ok) return;
  if (response.status === 409) {
    const noun = item === "prompt" ? "prompt" : "intro or outro";
    throw new Error(
      `Couldn't restore version ${String(version)}: another ${noun} now has the name it had. Rename that one in the Library, then press Restore again.`,
    );
  }
  throw await failure(response);
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

export async function listDocumentThemes(api: Api): Promise<DocumentThemeListBody> {
  return read<DocumentThemeListBody>(await api.client["document-themes"].$get());
}

export async function saveDocumentTheme(
  api: Api,
  draft: { readonly name: string; readonly values: DocumentTheme },
  id: string | undefined,
): Promise<SaveResult<SavedDocumentTheme>> {
  const json = { name: draft.name, values: draft.values };
  return saved<SavedDocumentTheme>(
    id === undefined
      ? await api.client["document-themes"].$post({ json })
      : await api.client["document-themes"][":id"].$put({ param: { id }, json }),
  );
}

export async function removeDocumentTheme(api: Api, id: string): Promise<void> {
  const response = await api.client["document-themes"][":id"].$delete({ param: { id } });
  if (!response.ok) {
    throw await failure(response);
  }
}

// The sample article laid out with unsaved values, as a PDF for the editor's preview.
export async function previewDocumentTheme(
  api: Api,
  values: DocumentTheme,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await api.client["document-themes"].preview.$post(
    { json: { values: values as never } },
    { init: { signal } },
  );
  if (!response.ok) {
    throw await failure(response);
  }
  return await response.blob();
}

// The other projects' pronunciations, merged, for Edit project to copy into this one.
export async function readSharedPronunciations(
  api: Api,
  except: string,
): Promise<{ readonly entries: readonly SharedPronunciation[]; readonly projects: number }> {
  return read(await api.client.pronunciations.shared.$get({ query: { except } }));
}

// Library → Aliases: the whole ordered list, read and saved at once.
export async function readNarrationAliases(
  api: Api,
): Promise<{ readonly aliases: readonly NarrationAlias[] }> {
  return read(await api.client.pronunciations.aliases.$get());
}
export async function saveNarrationAliases(
  api: Api,
  aliases: readonly NarrationAlias[],
): Promise<SaveResult<{ readonly aliases: readonly NarrationAlias[] }>> {
  return saved(await api.client.pronunciations.aliases.$put({ json: { aliases: [...aliases] } }));
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

// Voice auditions (`edge/http/auditions.ts`): the price of each speaker's line first, and the
// spoken line only on the Audition button, which says it was confirmed.
export interface AuditionLine {
  readonly speaker: string;
  readonly provider: string;
  readonly model: string;
  readonly text: string;
}
export async function quoteAuditions(
  api: Api,
  lines: readonly AuditionLine[],
): Promise<{ readonly estimate: CostEstimate | null }> {
  return read(await api.client.auditions.quote.$post({ json: { lines: [...lines] } }));
}
export async function speakAudition(
  api: Api,
  line: Omit<AuditionLine, "speaker"> & { readonly voice: string },
): Promise<Blob> {
  const response = await api.client.auditions.$post({ json: { ...line, confirmed: true } });
  if (!response.ok) throw await failure(response);
  return await response.blob();
}
