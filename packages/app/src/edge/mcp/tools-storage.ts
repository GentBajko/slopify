import { fullVideoInputSchema, quickShortInputSchema } from "../../slices/onboarding/model.js";
import { moveFilesBody } from "../http/storage-files.js";
import { manySchema } from "../http/trash.js";
import { formBody, type RouteTool } from "./route-tool.js";

const storage: readonly RouteTool[] = [
  {
    name: "get_files_folder",
    route: "GET /api/storage/files",
    title: "Read the files folder",
    description: "Where projects, backups and exports are kept.",
  },
  {
    name: "move_files_folder",
    route: "POST /api/storage/files/move",
    body: moveFilesBody,
    title: "Move the files folder",
    description: "Body: {target: the new folder's full path; it must be empty or new}.",
    confirm:
      "This moves every project and backup file to the new folder; Slopify refuses a folder that is not empty.",
  },
  {
    name: "get_storage_usage",
    route: "GET /api/storage",
    title: "Read disk use",
    description:
      "Settings → Backup & storage: disk used by projects (each with its outputs, working files and what can be freed), staged files and the trash.",
  },
  {
    name: "list_trash",
    route: "GET /api/trash",
    title: "Read the trash",
    description:
      "Deleted projects, prompts, intros and outros, templates and schedules, kept 30 days.",
  },
  {
    name: "restore_from_trash",
    route: "POST /api/trash/:kind/:id/restore",
    title: "Restore from the trash",
    description: "Puts the item back; a restored project picks up where it was.",
  },
  {
    name: "restore_from_trash_many",
    route: "POST /api/trash/bulk/restore",
    body: manySchema,
    title: "Restore several from the trash",
    description: "Restore for the ticked rows. Body: {items: [{kind, id}]}.",
  },
  {
    name: "delete_from_trash",
    route: "DELETE /api/trash/:kind/:id",
    title: "Delete for good",
    description: "Deletes one trashed item for good, like Delete now in the trash.",
    confirm:
      "The project and every file it produced are removed from disk (a deleted schedule keeps its run history on Schedules). Nothing removed here can be restored. This cannot be undone.",
  },
  {
    name: "delete_from_trash_many",
    route: "POST /api/trash/bulk/delete",
    body: manySchema,
    title: "Delete several for good",
    description: "Delete now for the ticked rows. Body: {items: [{kind, id}]}.",
    confirm:
      "The projects and every file they produced are removed from disk (deleted schedules keep their run history on Schedules). Nothing removed here can be restored. This cannot be undone.",
  },
];

const onboarding: readonly RouteTool[] = [
  {
    name: "get_onboarding",
    route: "GET /api/onboarding",
    title: "Read the welcome state",
    description: "Starter packs and what the welcome offers.",
  },
  {
    name: "install_starter_pack",
    route: "POST /api/onboarding/packs/:id",
    title: "Install a starter pack",
    description: "Adds a starter pack's prompts and templates.",
  },
  {
    name: "make_quick_short",
    route: "POST /api/onboarding/short",
    body: quickShortInputSchema,
    title: "Make a quick short",
    description: `${formBody("the welcome's Make a short")} It starts a paid run.`,
  },
  {
    name: "make_full_video_draft",
    route: "POST /api/onboarding/full-video",
    body: fullVideoInputSchema,
    title: "Draft a full video",
    description: formBody("the welcome's Make a full video"),
  },
  {
    name: "get_samples",
    route: "GET /api/onboarding/sample",
    title: "Read the sample projects",
    description: "Which bundled sample projects are in the projects list.",
  },
  {
    name: "restore_samples",
    route: "POST /api/onboarding/sample/restore",
    title: "Restore the samples",
    description: "Puts the bundled samples back as they shipped.",
  },
  {
    name: "copy_sample",
    route: "POST /api/onboarding/sample/copy",
    title: "Copy a sample",
    description: "Makes an editable copy of a sample, like Make my own copy.",
  },
];

export const storageTools: readonly RouteTool[] = [...storage, ...onboarding];
