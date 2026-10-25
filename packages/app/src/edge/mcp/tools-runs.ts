import { revisionControlSchema } from "../../slices/control/revision-control-schema.js";
import { previewRebuildSchema, startRebuildSchema } from "../../slices/rebuild/model.js";
import { restoreBody, saveBody } from "../http/revisions.js";
import { control, type RouteTool } from "./route-tool.js";

const runs: readonly RouteTool[] = [
  {
    name: "pause_project",
    route: "POST /api/projects/:id/pause",
    body: revisionControlSchema,
    title: "Pause",
    description: `Pause: the run stops after the steps already sent finish; nothing starts until resume_project. ${control}`,
  },
  {
    name: "resume_project",
    route: "POST /api/projects/:id/resume",
    body: revisionControlSchema,
    title: "Continue the run",
    description: `Continue the run: starts the project's held and unfinished work, including work a saved edit left waiting. On a canceled run it resumes the whole run, the canceled steps too; once a step of it was taken up again (retry_stage), only the steps taken up again go on and the rest stay canceled. ${control}`,
  },
  {
    name: "cancel_project",
    route: "POST /api/projects/:id/cancel",
    body: revisionControlSchema,
    title: "Cancel run",
    description: `Cancel run: stops every running stage of the project. ${control}`,
    confirm: "Cancel this run? It stops every running stage; finished outputs are kept.",
  },
  {
    name: "retry_stage",
    route: "POST /api/projects/:id/stages/:kind/retry",
    body: revisionControlSchema,
    title: "Try again",
    description: `Try again on a failed step (kind: research, article, audio, images, thumbnail, video or document), keeping what it already made. ${control}`,
  },
  {
    name: "soften_stage",
    route: "POST /api/projects/:id/stages/:kind/soften",
    body: revisionControlSchema,
    title: "Soften and retry",
    description: `Soften and retry, for a picture a content filter refused (kind images or thumbnail, or video for a short's picture): rewords the refused prompts and draws them again. ${control}`,
    confirm:
      "Your project's AI model rewrites each refused prompt without what a content filter could flag, keeping the scene and style. The image is then drawn again from the new wording, which it keeps as its prompt. The AI call and the new image are charged like any other.",
  },
  {
    name: "rerun_stage",
    route: "POST /api/projects/:id/stages/:kind/rerun",
    body: revisionControlSchema,
    title: "Make a stage again",
    description: `A section's Make … again button (Write the article again, Make all images again): makes a stage again and everything built on it. Making again what costs money is refused until it is reviewed: use preview_rebuild (Choose what to make again), then start_rebuild. ${control}`,
    confirm:
      "Make this stage again? It makes the stage and what is built on it again, which costs what the stage cost the first time; the previous outputs stay under Versions.",
  },
];

const revisions: readonly RouteTool[] = [
  {
    name: "prepare_revision",
    route: "POST /api/projects/:id/revisions/prepare",
    title: "Prepare an older project for editing",
    description:
      "Saves the first version of a project made before versions existed; nothing is generated.",
  },
  {
    name: "list_revisions",
    route: "GET /api/projects/:id/revisions",
    title: "Read project history",
    description:
      "Every saved version of the project, newest first, as Project history lists them (byAgent marks one an agent saved, byAssistant one the in-app assistant saved), and agentActions: what agents and the assistant did in the project (actor says which).",
  },
  {
    name: "get_revision",
    route: "GET /api/projects/:id/revisions/:revisionId",
    title: "Read a version",
    description:
      "One version in full: revision.config and revision.content (send them back as save_revision's edit.config and edit.content), its outputs, pieces and text parts.",
  },
  {
    name: "read_narration_chunks",
    route: "GET /api/projects/:id/revisions/:revisionId/narration-chunks",
    title: "Read narration chunk keys",
    description:
      'The narration chunk keys in spoken order, per segment: {chunks: {intro?, body?, outro?}}. "Narration chunk 5 of 10" in an error is chunks.body[4] (an intro or outro chunk is named after its segment); the key is what save_revision\'s edit.regenerate and content.narrationOverrides take.',
  },
  {
    name: "save_revision",
    route: "POST /api/projects/:id/revisions",
    body: saveBody,
    title: "Save an edit",
    description:
      "Saves an edit as a new version, like Save in Edit settings; it starts nothing. Body: {baseRevisionId, idempotencyKey: a new UUID, edit: {config, content, regenerate?: [work keys to make again, such as a narration chunk key], uploads?: [{stagedFileId, destination}]}}; send get_revision's revision.config and revision.content with your change. One chunk's wording or delivery note is content.narrationOverrides[chunk key] = {kind: \"text\", text, direction?}. Finished shorts kept through a new pick are content.shortsKeep: leave one out to pick a new moment for it, and lower config.shorts.count as well to drop it. Then preview_rebuild (Choose what to make again) says what it makes and costs, and start_rebuild starts it.",
  },
  {
    name: "restore_revision",
    route: "POST /api/projects/:id/revisions/restore",
    body: restoreBody,
    title: "Restore a version",
    description:
      "Makes an earlier version current again, like Restore on a row of Versions; it starts nothing. Body: {baseRevisionId, idempotencyKey: a new UUID, targetRevisionId}.",
  },
  {
    name: "preview_rebuild",
    route: "POST /api/projects/:id/rebuild/preview",
    body: previewRebuildSchema,
    title: "Choose what to make again",
    description:
      'Choose what to make again: what making it again makes, reuses or leaves blocked, each output\'s estimate and the total, like the project\'s Choose what to make again. Body: {baseRevisionId, request: {kind: "allAffected"} | {kind: "selected", workKeys: [...]}}. Nothing starts; start_rebuild does, with this preview\'s id.',
    unrecorded: true,
  },
  {
    name: "start_rebuild",
    route: "POST /api/projects/:id/rebuild",
    body: startRebuildSchema,
    title: "Make the previewed parts again",
    description:
      "Starts making again what you previewed: the acknowledgement Choose what to make again asks for. Body: {baseRevisionId, idempotencyKey: a new UUID, previewId: the preview's id, acknowledgeUnknownCosts: true only after reading the preview's unknown costs, confirmedProvidedWorkKeys: the preview's providedReuseRequired keys you accept replacing}.",
  },
];

export const runTools: readonly RouteTool[] = [...runs, ...revisions];
