import type { AppType } from "@app/edge/http/app.js";
import type { Project, ProjectSummary, RunDraft, Stage } from "@app/slices/admission/model.js";
import type { FieldError } from "@app/slices/admission/rules.js";
import type { Output, StagedFile } from "@app/slices/storage/model.js";
import { hc } from "hono/client";

export type { FieldError, Output, Project, ProjectSummary, RunDraft, Stage, StagedFile };

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
  const problem = await problemOf(response);
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
