import { z } from "zod";
import { oldVersionsConsequence } from "../../slices/storage/consequences.js";
import { control, type RouteTool } from "./route-tool.js";
import { listWithStateWords, projectWithStateWords } from "./state-shapes.js";

// What get_project_storage (and the page's Free up space) reads for the old versions.
const historySchema = z.object({ historyFiles: z.number(), historyBytes: z.number() });

const projects: readonly RouteTool[] = [
  {
    name: "list_projects",
    route: "GET /api/projects",
    title: "List projects",
    description:
      "Every project as the Projects list shows it: id, title, status, stateWord (how Slopify's pages say it: Queued, Running, Paused, Waiting for your review, Waiting for the agent, Prepared, Kept as is, Failed, Done with problems, Done, Canceled; an uploaded project reads Done), progress from 0 to 1, channelId and uploadedAt.",
    shape: listWithStateWords,
  },
  {
    name: "get_project",
    route: "GET /api/projects/:id",
    title: "Read a project",
    description:
      "One project as its page shows it: revisionId (the baseRevisionId every change needs), resumable, the project with its stateWord, each step with its state, stateWord (Not started, Running, Done, Provided, Failed, Canceled, Off), failure reason and ETA, and its current output files.",
    shape: projectWithStateWords,
  },
  {
    name: "trash_project",
    route: "DELETE /api/projects/:id",
    title: "Delete a project",
    description:
      "Delete on the Projects list: moves the project to the trash. A running project is refused: cancel it first.",
    confirm:
      "This moves the project to Settings → Backup & storage → Trash, where it is kept 30 days before it is deleted for good.",
  },
  {
    name: "move_projects_to_channel",
    route: "POST /api/projects/move-channel",
    title: "Move to a channel",
    description:
      "Move to a channel, for one project or many at once, like Move on the Projects list. Body: {projectIds: [project ids], channelId}.",
  },
  {
    name: "get_run_queue",
    route: "GET /api/projects/queue",
    title: "Read the run queue",
    description:
      "The batch queue: projects waiting their turn, in order. Play's Queue switch (the draft's queue field) puts a run's videos here.",
  },
  {
    name: "move_in_run_queue",
    route: "POST /api/projects/queue/:projectId/move",
    title: "Move in the run queue",
    description: "Moves a queued project one place earlier or later. Body: {by: -1 | 1}.",
  },
  {
    name: "estimate_run",
    route: "POST /api/projects/estimate",
    title: "Estimate a run",
    description:
      "The cost estimate Play shows before Start. Body: {draft: a run draft, expectedWords?: 1-100000, items?}. For a Play draft, review_draft returns the same estimate.",
    unrecorded: true,
  },
  {
    name: "get_run_cost",
    route: "GET /api/projects/:id/run-cost",
    title: "Read a project's run cost",
    description:
      "What the project's runs cost so far, by stage and provider, and any wait on a CLI plan's limits, as its Run cost tab shows.",
  },
  {
    name: "get_week",
    route: "GET /api/home/week",
    title: "Read this week",
    description:
      "Home's This week: videos made, calls, cost and CLI plan standings. Query: {since: an ISO time, channelId?}.",
  },
  {
    name: "mark_uploaded",
    route: "PUT /api/projects/:id/uploaded",
    title: "Mark uploaded",
    description:
      "Mark uploaded (or its Undo), like Home → Ready to upload: records that the person uploaded the video. Call it once per project to mark several. Slopify never uploads. Body: {uploaded: true | false}.",
  },
  {
    name: "keep_as_is",
    route: "PUT /api/projects/:id/set-aside",
    title: "Keep as is",
    description:
      "Keep as is on Home's Needs you: a run waiting only on held work leaves the list without running anything, until the project's next edit. Body: {setAside: true}, or {setAside: false} for its Undo.",
  },
  {
    name: "get_project_storage",
    route: "GET /api/storage/projects/:id",
    title: "Read a project's disk use",
    description:
      "How much disk the project's outputs, working files and old versions (History) use, and what Keep outputs only or Delete old versions would free.",
  },
  {
    name: "keep_project_outputs",
    route: "POST /api/storage/projects/:id/keep-outputs",
    title: "Keep outputs only",
    description:
      "Frees a finished project's working files and keeps its outputs, like Free space on the project page.",
    confirm:
      "This removes the working files the project was made from (images, narration parts, subtitle timing, render settings) and keeps the video, shorts, thumbnail, article, description and document. Changing the project later makes those files again first, which takes time and uses provider credits.",
  },
  {
    name: "delete_old_versions",
    route: "POST /api/storage/projects/:id/old-versions/delete",
    title: "Delete old versions",
    description:
      "Delete old versions for this one project; answers how many files were deleted and the bytes freed. Delete all old versions and Clean up everything (every project) are the person's, in Settings → Backup & storage.",
    confirm: `${oldVersionsConsequence(undefined, "project")} get_project_storage says how many files and how much space first.`,
    confirmFrom: {
      route: "/api/storage/projects/:id",
      text: (value) => {
        const storage = historySchema.safeParse(value);
        return storage.success
          ? oldVersionsConsequence(
              { files: storage.data.historyFiles, bytes: storage.data.historyBytes },
              "project",
            )
          : undefined;
      },
    },
  },
];

const outputs: readonly RouteTool[] = [
  {
    name: "preview_added_output",
    route: "POST /api/projects/:id/outputs/preview",
    title: "Preview another output",
    description:
      "Add another output, first step: what the new output reuses, makes and is estimated to cost, and any choice the project lacks for it. Body: {baseRevisionId, kind: narration | audiobook | images | video | pdf | podcast}.",
    unrecorded: true,
  },
  {
    name: "add_output",
    route: "POST /api/projects/:id/outputs",
    title: "Add another output",
    description:
      'Switches the output on as a new version and answers the workKeys to make; it starts nothing. Then preview_rebuild with {kind: "selected", workKeys} and start_rebuild, as the page\'s Add does. Body: {baseRevisionId, idempotencyKey: a new UUID, kind, adapt?: true to accept rewriting the text as a conversation}.',
  },
];

const decisions: readonly RouteTool[] = [
  {
    name: "get_checkpoints",
    route: "GET /api/projects/:id/checkpoints",
    title: "Read review checkpoints",
    description:
      "The project's review checkpoints: each gate's stage, state, fingerprint and currentFingerprint. A gate is Waiting for your review while held.",
  },
  {
    name: "approve_checkpoint",
    route: "POST /api/projects/:id/checkpoints/:checkpointId/approve",
    title: "Approve a checkpoint",
    description:
      "Approves a held checkpoint so the stages after it run, like Approve on the project page. Body: {revisionId, fingerprint: the gate's currentFingerprint, idempotencyKey: a new UUID}.",
  },
  {
    name: "change_checkpoints",
    route: "PATCH /api/projects/:id/checkpoints",
    title: "Change checkpoints",
    description:
      'Sets the stages that stop for approval, like the Checkpoints tab. Body: {revisionId, stages: ["audio" | "images" | "video"]}.',
  },
  {
    name: "list_reviews",
    route: "GET /api/projects/:id/reviews",
    title: "Read review verdicts",
    description:
      "Each reviewed item's latest verdict: passed, reasons, outcome, attempt, action and redo state, and whether it is about the output shown now (current).",
  },
  {
    name: "overrule_review",
    route: "POST /api/projects/:id/reviews/:verdictId/overrule",
    title: "Overrule a verdict",
    description:
      "Keeps a flagged item as it is, like Overrule; it also calls off a redo still waiting to start.",
  },
  {
    name: "redo_review",
    route: "POST /api/projects/:id/reviews/:verdictId/redo",
    title: "Redo a flagged item",
    description: `Makes a flagged item again, like Redo beside it. ${control}`,
  },
  {
    name: "submit_review_verdict",
    route: "POST /api/projects/:id/external-reviews/:reviewId/verdict",
    title: "Answer an external review",
    description:
      'Your verdict on a review waiting for an agent (read it first with get_external_review). Body: {verdict: "pass" | "fail", reasons: [one short sentence per problem]}: a fail needs at least one reason, at most 10, each 1 to 500 characters. The first verdict saved is kept.',
  },
];

export const projectTools: readonly RouteTool[] = [...projects, ...outputs, ...decisions];
