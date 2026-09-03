import type { StageKind } from "@app/kernel/pipeline.js";
import type { Api, ProjectBody } from "@/api";
import { fileUrl } from "@/api";
import { errorOf, problemOf, readText } from "@/http";

// The six actions on the project page, and the one read the stage bodies need. Every one
// answers with the whole project as the server sees it after the change (`edge/http/actions.ts`
// view()), so the page writes that straight into its cache instead of asking again.

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

export async function cancelRun(api: Api, projectId: string): Promise<ActionResult> {
  return acted(await api.client.projects[":id"].cancel.$post({ param: { id: projectId } }));
}

export async function retryStage(
  api: Api,
  projectId: string,
  kind: StageKind,
): Promise<ActionResult> {
  return acted(
    await api.client.projects[":id"].stages[":kind"].retry.$post({
      param: { id: projectId, kind },
    }),
  );
}

export async function rerunStage(
  api: Api,
  projectId: string,
  kind: StageKind,
): Promise<ActionResult> {
  return acted(
    await api.client.projects[":id"].stages[":kind"].rerun.$post({
      param: { id: projectId, kind },
    }),
  );
}

export async function saveArticle(
  api: Api,
  projectId: string,
  markdown: string,
): Promise<ActionResult> {
  return acted(
    await api.client.projects[":id"].article.$put({ param: { id: projectId }, json: { markdown } }),
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
