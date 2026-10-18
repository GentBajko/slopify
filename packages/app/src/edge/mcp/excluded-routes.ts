// The API routes agents are not offered, each with the reason. `tools-parity.test.ts` fails
// when a route is neither a tool nor listed here.
const keys = "provider keys are credentials; agents see providers only as configured or missing";
const backups = "backups (export, import, restore and their schedule) are the person's";
const updater = "updating Slopify is the person's";
const hostSetup =
  "host setup (start at login, CLI paths, the extension's download) is the person's";
const desktop = "opens a window on the person's desktop; agents read files with get_project_file";
const listening = "sound and pictures for the person watching the page";
const personal = "the person's own tutorial, notices and reading state";
const retired = "retired: answers revision-required; edits go through save_revision";
const extension = "only the paired Slopify Studio extension calls these";
const youtube =
  "acts on YouTube: agents stop at Ready to upload, and uploading is the person's (the extension's queue is filled only from Prepare upload)";
const cleanup =
  "every project's cleanup is the person's: Delete all old versions and Clean up everything are in Settings → Backup & storage";
const notStarted =
  "not a page action: projects start from Play drafts (start_draft) after their review and estimate";

export const excludedRoutes: Readonly<Record<string, string>> = {
  "GET /api/health": "the MCP connection itself shows Slopify is running",
  "GET /api/home/autopilot/weekly":
    "Settings → Notifications reads it alone; get_autopilot answers weeklyNotify",
  "GET /api/events/global": "a live stream for open pages; agents read needs_attention",
  "GET /api/events/projects/:id": "a live stream for open pages; agents read needs_attention",
  "POST /api/storage/files/open": desktop,
  "POST /api/projects/:id/open-folder": desktop,
  "POST /api/projects/:id/revisions/:revisionId/:recordId/open-folder": desktop,
  "GET /api/storage/export/summary": backups,
  "GET /api/storage/export": backups,
  "PUT /api/storage/import": backups,
  "GET /api/backups": backups,
  "PUT /api/backups": backups,
  "POST /api/backups/run": backups,
  "POST /api/storage/old-versions/delete": cleanup,
  "POST /api/storage/cleanup": cleanup,
  "GET /api/update/ready": updater,
  "POST /api/update/activate": updater,
  "GET /api/update": updater,
  "DELETE /api/update": updater,
  "POST /api/update": updater,
  "POST /api/projects": notStarted,
  "POST /api/projects/batch": notStarted,
  "GET /api/projects/:projectId/audio-preview": listening,
  "GET /api/projects/:projectId/audio-preview/:previewId": listening,
  "GET /api/projects/:projectId/narration/peaks": listening,
  "POST /api/auditions": `${listening}; its price is quote_voice_sample`,
  "POST /api/style-preview": listening,
  "GET /api/style-preview/:file": listening,
  "POST /api/document-themes/preview": listening,
  "GET /api/fonts/:id/file": listening,
  "PATCH /api/projects/:id/providers": retired,
  "PUT /api/projects/:id/article": retired,
  "DELETE /api/projects/:id/images/:outputId": retired,
  "POST /api/projects/:id/images/:outputId/regenerate": retired,
  "PATCH /api/projects/:id/subtitles": retired,
  "GET /api/telemetry/notice": personal,
  "POST /api/telemetry/notice": personal,
  "GET /api/tutorial": personal,
  "PUT /api/tutorial": personal,
  "DELETE /api/tutorial": personal,
  "GET /api/whats-new": personal,
  "POST /api/whats-new/seen": personal,
  "GET /api/patch-notes": personal,
  "POST /api/patch-notes/seen": personal,
  "GET /api/patch-notes/:id": personal,
  "GET /api/tutorials": personal,
  "GET /api/tutorials/search": personal,
  "GET /api/tutorials/:page": personal,
  "GET /api/providers/first-run": personal,
  "POST /api/providers/first-run/dismiss": personal,
  "POST /api/onboarding/dismiss": personal,
  "GET /api/settings/autostart": hostSetup,
  "PUT /api/settings/autostart": hostSetup,
  "POST /api/settings/autostart/answer": hostSetup,
  "PUT /api/providers/:id/path": hostSetup,
  "GET /api/studio/extension/:file": hostSetup,
  "GET /api/providers/key-guides": keys,
  "PUT /api/providers/:id/key": keys,
  "POST /api/providers/:id/key/test": keys,
  "DELETE /api/providers/:id/key": keys,
  "POST /api/studio/settings/pairing": "makes the extension's pairing token, a credential",
  "POST /api/studio/packs/:projectId/choose": youtube,
  "PUT /api/studio/settings/auto-comment": `${youtube}; this posts comments in the person's name`,
  "POST /api/studio/ext/pair": extension,
  "GET /api/studio/ext/pack": extension,
  "POST /api/studio/ext/filled": extension,
  "POST /api/studio/ext/backfill": extension,
  "GET /api/studio/ext/ready": extension,
  "POST /api/studio/ext/upload": `${extension}; ${youtube}`,
  "POST /api/studio/ext/upload-all": `${extension}; ${youtube}`,
  "GET /api/studio/ext/packs/:projectId": extension,
  "GET /api/studio/ext/tasks": extension,
  "POST /api/studio/ext/task-result": extension,
  "GET /api/studio/ext/known-videos": extension,
  "GET /api/studio/ext/recorded-videos": extension,
  "POST /api/studio/ext/gone": extension,
  "POST /api/studio/ext/stats": extension,
  "POST /api/studio/ext/video": extension,
  "POST /api/studio/ext/video/done": extension,
  "GET /api/studio/ext/files/:projectId/:asset": extension,
};
