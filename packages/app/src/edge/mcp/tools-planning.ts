import { formBody, type RouteTool } from "./route-tool.js";

const drafts: readonly RouteTool[] = [
  {
    name: "list_drafts",
    route: "GET /api/drafts",
    title: "List Play drafts",
    description: "Play drafts: saved setups for Create, not started yet.",
  },
  {
    name: "create_draft",
    route: "POST /api/drafts",
    title: "Create a Play draft",
    description:
      "Create, like New project: a draft whose document is the Play form (kind and outputs, format including square 1:1, sources, prompts, voices, reviews, the queue switch). Body: {id: a new UUID, document}. get_draft shows a document's shape; instantiate_template makes one from a template.",
  },
  {
    name: "get_draft",
    route: "GET /api/drafts/:id",
    title: "Read a Play draft",
    description: "A Play draft: its document, version, attachments, latest review and start.",
  },
  {
    name: "save_draft",
    route: "PUT /api/drafts/:id",
    title: "Save a Play draft",
    description:
      "Saves the draft's document; queue: true is Play's Queue switch, so several videos run one after another. Body: {baseVersion: the draft's version, mutationId: a new UUID, document}.",
  },
  {
    name: "fork_draft",
    route: "POST /api/drafts/:id/fork",
    title: "Copy a Play draft",
    description: "Body: {id: a new UUID for the copy, sourceId: this draft's id, document}.",
  },
  {
    name: "discard_draft",
    route: "DELETE /api/drafts/:id",
    title: "Discard a Play draft",
    description: "Body: {baseVersion}.",
    confirm: "This discards the draft and its uploaded files for good.",
  },
  {
    name: "review_draft",
    route: "POST /api/drafts/:id/review",
    title: "Review a Play draft",
    description:
      "Play's Review step: readiness, warnings and the cost estimate the person sees before Start. Body: {baseVersion}. start_draft needs this review's id.",
    readOnly: true,
  },
  {
    name: "start_draft",
    route: "POST /api/drafts/:id/start",
    title: "Start a Play draft",
    description:
      "Start in Play: starts the reviewed draft's runs, which spend what the review estimated. Body: {baseVersion, reviewId: the id review_draft returned}.",
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
    title: "Create a template",
    description: formBody("the template editor"),
  },
  {
    name: "template_from_project",
    route: "POST /api/project-templates/from-project/:projectId",
    title: "Save a project as a template",
    description: formBody("Save as template on the project page"),
  },
  {
    name: "next_chapter_template",
    route: "POST /api/project-templates/next-chapter/:projectId",
    title: "Template for the next chapter",
    description: formBody("Next chapter on the project page"),
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
    title: "Save a template",
    description: `${formBody("the template editor")} Saving adds a version.`,
  },
  {
    name: "delete_template",
    route: "DELETE /api/project-templates/:id",
    title: "Delete a template",
    description: formBody("Delete in Library → Templates"),
    confirm:
      "Moves it to the trash for 30 days (Settings → Trash). Existing projects and drafts keep their setup.",
  },
  {
    name: "instantiate_template",
    route: "POST /api/project-templates/:id/instantiate",
    title: "Use a template",
    description: "Opens a new Play draft from the template, like Use template.",
  },
];

export const planningTools: readonly RouteTool[] = [...drafts, ...templates];
