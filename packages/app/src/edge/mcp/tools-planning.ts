import { createDraftInputSchema } from "../../slices/play-drafts/schema.js";
import { templateCreateSchema } from "../../slices/project-templates/schema.js";
import { startBody, versionBody } from "../http/drafts.js";
import {
  nextChapterBody,
  templateDeleteBody,
  templateFromProjectBody,
  templateInstantiateBody,
  templateUpdateBody,
} from "../http/project-templates.js";
import { saveBody } from "../http/revisions.js";
import { formBody, type RouteTool } from "./route-tool.js";

const drafts: readonly RouteTool[] = [
  {
    name: "list_drafts",
    route: "GET /api/drafts",
    title: "List the drafts on Create",
    description: "Drafts on Create: videos set up there and not started yet.",
  },
  {
    name: "create_draft",
    route: "POST /api/drafts",
    body: createDraftInputSchema,
    title: "Make a new draft on Create",
    description:
      "New draft, as on Create: a draft whose document is Create's form (kind and outputs, format including square 1:1, sources, prompts, voices, reviews, the One after another switch). Body: {id: a new UUID, document}. get_draft shows a document's shape; instantiate_template makes one from a template.",
  },
  {
    name: "get_draft",
    route: "GET /api/drafts/:id",
    title: "Read a draft",
    description: "A draft on Create: its document, version, attachments, latest review and start.",
  },
  {
    name: "save_draft",
    route: "PUT /api/drafts/:id",
    body: saveBody,
    title: "Save a draft",
    description:
      "Saves the draft's document; queue: true is Create's One after another switch, so several videos run one after another. Body: {baseVersion: the draft's version, mutationId: a new UUID, document}.",
  },
  {
    name: "fork_draft",
    route: "POST /api/drafts/:id/fork",
    body: createDraftInputSchema,
    title: "Copy a draft",
    description: "Body: {id: a new UUID for the copy, sourceId: this draft's id, document}.",
  },
  {
    name: "discard_draft",
    route: "DELETE /api/drafts/:id",
    body: versionBody,
    title: "Discard a draft",
    description: "Body: {baseVersion}.",
    confirm: "This discards the draft and its uploaded files for good.",
  },
  {
    name: "review_draft",
    route: "POST /api/drafts/:id/review",
    body: versionBody,
    title: "Review a draft",
    description:
      "Create's review: readiness, warnings and the cost estimate the person sees before Make the video. Body: {baseVersion}. start_draft needs this review's id.",
    unrecorded: true,
  },
  {
    name: "start_draft",
    route: "POST /api/drafts/:id/start",
    body: startBody,
    title: "Start a draft",
    description:
      "Make the video on Create: starts the reviewed draft's runs, which spend what the review estimated. Body: {baseVersion, reviewId: the id review_draft returned}.",
  },
  {
    name: "upload_draft_attachment",
    route: "PUT /api/drafts/:id/attachments/:attachmentId/file",
    title: "Upload a draft's file",
    description:
      "Uploads a draft's file (audio, images, thumbnail or establishing image) under the attachment id its document names.",
    upload: "multipart",
  },
  {
    name: "get_draft_attachment",
    route: "GET /api/drafts/:id/attachments/:attachmentId/file",
    title: "Read a draft's picture",
    description: "A draft's uploaded picture, as an image.",
  },
  {
    name: "list_staged_files",
    route: "GET /api/staging",
    title: "List uploaded files",
    description: "Files uploaded for edits and not used yet.",
  },
  {
    name: "upload_staged_file",
    route: "POST /api/staging/:kind",
    title: "Upload a file for an edit",
    description:
      "Uploads a file an edit uses (kind: the stage it is for); save_revision's edit.uploads names it by the id this returns.",
    upload: "multipart",
  },
  {
    name: "delete_staged_file",
    route: "DELETE /api/staging/:id",
    title: "Remove an uploaded file",
    description: "Removes an uploaded file no edit used.",
  },
];

// Which version a schedule runs after a save (`template-studio/gate.ts`).
const templateGateRule =
  "Schedules use a new version from their next run unless a version of this template was approved for schedules in Edit template (mark_template_ready); from then on a new version waits until it is approved.";

const templates: readonly RouteTool[] = [
  {
    name: "list_templates",
    route: "GET /api/project-templates",
    title: "List templates",
    description: "Project templates with their versions.",
  },
  {
    name: "create_template",
    route: "POST /api/project-templates",
    body: templateCreateSchema,
    title: "Create a template",
    description: `${formBody("the template editor")} ${templateGateRule}`,
  },
  {
    name: "template_from_project",
    route: "POST /api/project-templates/from-project/:projectId",
    body: templateFromProjectBody,
    title: "Save a project as a template",
    description: `${formBody("Save as template on the project page")} ${templateGateRule}`,
  },
  {
    name: "next_chapter_template",
    route: "POST /api/project-templates/next-chapter/:projectId",
    body: nextChapterBody,
    title: "Template for the next chapter",
    description: `${formBody("Next chapter on the project page")} ${templateGateRule}`,
  },
  {
    name: "get_template",
    route: "GET /api/project-templates/:id",
    title: "Read a template",
    description: "One template with its current version and history.",
  },
  {
    name: "update_template",
    route: "PUT /api/project-templates/:id",
    body: templateUpdateBody,
    title: "Save a template",
    description: `${formBody("the template editor")} Saving adds a version. ${templateGateRule}`,
  },
  {
    name: "delete_template",
    route: "DELETE /api/project-templates/:id",
    body: templateDeleteBody,
    title: "Delete a template",
    description: formBody("Delete on Templates"),
    confirm:
      "Moves it to the trash for 30 days (Settings → Trash). Existing projects and drafts keep their setup.",
  },
  {
    name: "instantiate_template",
    route: "POST /api/project-templates/:id/instantiate",
    body: templateInstantiateBody,
    title: "Make a video from a template",
    description: "Opens a new draft on Create from the template, like Make a video on Templates.",
  },
];

export const planningTools: readonly RouteTool[] = [...drafts, ...templates];
