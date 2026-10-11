---
scenario: mcp-agent-access
screens:
- 01-projects
- 03-project
- 08-settings
- 15-home
depends_on:
- 04-run-admission
- 12-reruns-and-edits
- 13-cancel
- 23-review-checkpoints
- 25-scheduled-jobs
- 32-studio-upload-prep
- 33-automatic-reviews
- 38-home-attention-and-uploads
- 39-notifications-and-live-events
- 40-trash-and-scheduled-backups
generated_at_commit: d447a799ebc5
generated_date: 2026-10-11
capstone_version: 7.0.1
content_hash: 07f2c7712f97
paths_covered:
  - ":(top)packages/app/src/edge/mcp/**"
  - ":(top)packages/app/src/slices/agents/**"
  - ":(top)packages/app/src/edge/http/actor.ts"
  - ":(top)packages/app/src/edge/http/starts.ts"
  - ":(top)packages/app/src/edge/http/external-reviews.ts"
  - ":(top)packages/app/src/slices/admission/state-words.ts"
  - ":(top)packages/app/src/slices/reviews/holds.ts"
  - ":(top)packages/app/src/slices/reviews/external-*.ts"
  - ":(top)packages/app/src/slices/rebuild/remake-outdated.ts"
  - ":(top)packages/app/src/slices/storage/project-files.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0056-agent-actions.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0057-agent-action-once.sql"
  - ":(top)packages/app/scripts/container-smoke.sh"
  - ":(top)packages/web/src/agents/**"
  - ":(top)packages/web/src/project/revision-history.tsx"
absorbed_from:
  - features/2026-09-30-slopify-mcp@2026-10-11
---

# 45 MCP agent access

An external agent (Claude Code, Claude Desktop, Codex) drives Slopify through a built-in MCP endpoint with the same powers, checks, costs and refusal sentences as the person in the web page, up to **Ready to upload**. Every tool is an existing `/api` route called in-process as the agent, plus seven tools of its own. The agent's usual job is the attend routine: read what waits for someone, clear what it may, report what it may not. What it changes is recorded and shown "by agent". Uploading stays the person's. Paths starting `slices/`, `edge/` or `kernel/` are under `packages/app/src/`.

## Trigger & preconditions

| Behavior | Trigger | Preconditions |
|---|---|---|
| Connect | The agent POSTs an MCP `initialize` to `/mcp` on the app's own host and port, mounted on the Hono app (`edge/http/app.ts:325-342`, `mcpPath`, `slices/agents/model.ts:9`) | Slopify is running; no token. An `Origin` header, when sent, passes the Origin rule (Steps 1–2) |
| Call a tool | A `tools/call` POST to `/mcp` | The same as the matching page action: the route's validation, admission and guards decide |
| Read the work queue | `needs_attention` (`edge/mcp/server.ts:32-49`) | None |
| Run the routine | The agent's own scheduler (a Claude scheduled task, a Codex automation) runs the prompt `attend` or follows the server instructions (`edge/mcp/server.ts:50-57`, `edge/mcp/instructions.ts:1-18`) | Slopify cannot wake an agent; agents poll |
| See the connection | Settings → Connections → Agents (MCP) (`packages/web/src/agents/agent-settings.tsx`), `GET /api/settings/agents` (`edge/http/settings.ts:150-157`), also the tool `get_agent_connection` (`edge/mcp/tools-setup.ts:176-182`) | None |

Setup lines the tab shows, each with Copy: Claude Code `claude mcp add --transport http slopify <url>` with "Run it once in a terminal.", and Codex `[mcp_servers.slopify]` / `url = "<url>"` with "Add it to ~/.codex/config.toml." (`slices/agents/model.ts:11-22`, `packages/web/src/agents/agent-settings.tsx:27-28`). The URL is this install's origin plus `/mcp`.

## Steps

### Connection (`edge/mcp/http.ts`)

1. **Transport**: MCP Streamable HTTP, stateless. Each POST gets a new server and a new `WebStandardStreamableHTTPServerTransport` with no session id generator and `enableJsonResponse: true`; the server is closed when the answer is sent (`edge/mcp/http.ts:77-100`, `edge/mcp/server.ts:20-31`). GET and DELETE answer 405 "Slopify's MCP endpoint keeps no session and no event stream: send each request as a POST." (`edge/mcp/http.ts:102-108`). Body limit 48 MB → 413; a body that is not JSON → 400 (`:16-18`, `:66-87`). There is no stdio transport or bridge. Native and Docker installs serve it alike; the container smoke test sends an `initialize` through the published port (`packages/app/scripts/container-smoke.sh:78`).
2. **Origin rule** (`originAllowed`, `edge/mcp/http.ts:20-34`): no `Origin` → accepted (CLI agents send none); an origin whose hostname is `localhost`, `*.localhost`, `127.0.0.1` or `[::1]` → accepted; one equal to the configured `--host`, when that is not a wildcard (`""`, `0.0.0.0`, `::`) → accepted; anything else, or an unparseable origin → 403 JSON-RPC error "Slopify refused this MCP request because it came from a web page at another address. Agents connect from the command line with no Origin; the setup lines are in Settings → Connections → Agents (MCP)." (`:58-65`). The port is not compared, since inside Docker the published port is unknown.
3. **Last connected**: a POST carrying an `initialize` message writes the setting `agents.lastConnectedAt` (`edge/mcp/http.ts:88`, `slices/agents/connection.ts:5-11`). The tab shows that time or "No agent has connected yet." (`packages/web/src/agents/agent-settings.tsx:74`). Backups leave the setting out (`slices/storage/portable.ts:493`).
4. **Instructions**: the server's instructions say every tool does what the matching button does, with the same checks, costs and refusal sentences, that changes show "by agent", and give the attend routine; the prompt `attend` returns the same routine (`edge/mcp/instructions.ts:3-18`).

### Tools and parity

5. **201 tools**: 194 route tools, the union of nine tables (`routeTools`, `edge/mcp/tools.ts:12-23`: projects, publishing, runs, planning, schedules, channels, library, setup, storage), plus seven of their own: `list_project_files`, `get_project_file` (`edge/mcp/file-tools.ts:152-175`), `get_external_review` (`edge/mcp/review-tools.ts:76-88`), `export_library`, `import_library` (`edge/mcp/library-tools.ts:180-203`), `preview_remake_outdated` (`edge/mcp/remake-tools.ts:108-120`) and `needs_attention` (`edge/mcp/server.ts:32-49`). One prompt, `attend`.
6. **79 exclusions**, each with its reason (`excludedRoutes`, `edge/mcp/excluded-routes.ts:1-100`), in these groups: provider keys, key guides and key tests (credentials: providers are shown only as configured or missing, `list_providers`, `edge/mcp/tools-setup.ts:26-35`); the extension's pairing token; backups (export, import, restore, their schedule); the updater; host setup (start at login, CLI paths, the extension download); every project's cleanup (`POST /api/storage/old-versions/delete`, `POST /api/storage/cleanup`, the person's in Settings → Backup & storage); YouTube actions (`POST /api/studio/packs/:projectId/choose`, `PUT /api/studio/settings/auto-comment`); the extension-only `/api/studio/ext/*` routes; the live SSE streams; opening folders and desktop windows; sound and picture previews (auditions, style preview, audio preview, waveform peaks; Try a sample's price is the tool `quote_voice_sample`); the person's tutorial, notices, What's new, patch notes and telemetry notice; retired revision-required routes; and `POST /api/projects` and `/batch`, since projects start from Play drafts (`start_draft`).
7. **Parity test** (`edge/mcp/tools-parity.test.ts:25-34`): it enumerates `app.routes` and fails when a route is neither a tool nor excluded, when an exclusion is also a tool, or when an exclusion names no route; another case checks keys, the pairing token, backups, the updater, host setup and YouTube actions stay excluded (`:41-69`).
8. **Annotations** (`edge/mcp/server.ts:61-77`): read-only for a GET, or for a POST marked as only looking (`unrecorded`) that sends nothing out; destructive for a DELETE or a tool with a confirmation; open-world when the route reaches outside Slopify (`reachesOut`, `edge/mcp/route-tool.ts:22-28`).
9. **State words**: the project list and a project's body gain `stateWord`, and each step a step state word, from the one table the web uses (`listWithStateWords`, `projectWithStateWords`, `edge/mcp/state-shapes.ts:36-67`; `slices/admission/state-words.ts:9-45`). Project: Queued, Running, Paused, Failed, Done with problems, Done, Canceled; held: Kept as is, Waiting for the agent, Stopped, Prepared, Waiting for your review, in that precedence (`heldStateWord`, `state-words.ts:80-86`). Step: Not started, Running, Done, Provided, Failed, Canceled, Off.

### A tool call (`callRoute`, `edge/mcp/call-route.ts:44-93`)

10. Path parameters must be ids as Slopify lists them: letters, digits, `-` and `_`, 1–256 characters (`pathParam`, `edge/mcp/route-tool.ts:55-61`); the filled URL must resolve to the tool's own route, else the call is refused before anything is sent (`call-route.ts:50-56`, `:130-134`).
11. **Confirmation**: a tool whose page asks "are you sure" (Cancel run, Soften and retry, Re-run a stage, Delete old versions, Move to Trash, Delete forever and the other deletes) is refused until called with `confirmed: true`, with the page's consequence sentence, worded with this call's numbers when the page reads them (`confirmFrom`, e.g. Delete old versions' file count and size), and "call <tool> again with confirmed: true to go ahead" (`call-route.ts:57-60`, `:95-114`; `edge/mcp/route-tool.ts:14-21`).
12. **In-process as the agent**: the request goes to the same app through `app.request(request, undefined, agentBindings)` with the Hono binding `{ actor: "agent" }` (`edge/http/app.ts:340`, `edge/http/actor.ts:4-14`). No network request can set it, so routes tell an agent from the person with `actorOf(c)`. Every middleware and route rule applies unchanged: shutdown and update gates, the sample read-only guard (`edge/http/app.ts:249-307`), validation, admission, refusals, events to open pages, and the start recorder.
13. **Answer**: a refusal is returned as an MCP error with the route's own sentence (Step 22); 204 or an empty body → "Done."; an image → MCP image content; JSON → the JSON, reshaped where the tool says (state words added, a secret left out); text → text; any other file → a sentence pointing at `get_project_file` (`call-route.ts:155-182`).
14. **Recording**: every successful call that is not a GET and not marked `unrecorded` is saved in `agent_actions` with the tool, its title, the project(s) it changed (the one its path names, those its body lists or its answer made), the schedule, and the version it saved (`call-route.ts:74-91`; `subjectsOf`, `revisionIdOf`, `edge/mcp/attribution.ts:18-54`; `recordAgentAction`, `slices/agents/repo.ts:48-71`). `import_library` records its own action (`edge/mcp/library-tools.ts:165`).

### Revision safety

15. Every project change the page guards with a base and a key takes the same two: `baseRevisionId` (the `revisionId` `get_project` returns) and `idempotencyKey` (a new UUID, sent again only to retry the very same request) (`control`, `edge/mcp/route-tool.ts:36-39`). The route checks them as for the page (12-reruns-and-edits.md). A stale base is the route's `conflict` with `currentRevisionId`; the MCP refusal adds "The project's current revision is <id>: read it with get_project, then call <tool> once more with baseRevisionId <id> and a new idempotencyKey." (`call-route.ts:288-291`). A replayed key gets the first answer, and is recorded as one action (`agent_actions_once`, `kernel/db/migrations/0057-agent-action-once.sql:1-5`; `slices/agents/repo.ts:56-60`).

### Spending

16. No paid work starts unseen, exactly as in the page: a project starts only through `start_draft` after `review_draft` (Play's Review with readiness, warnings and the estimate) (`edge/mcp/tools-planning.ts:44-57`); a remake only through `start_rebuild` after `preview_rebuild` (Choose what to remake with each output's estimate and the total), acknowledging unknown costs and confirming replaced provided content (`edge/mcp/tools-runs.ts:91-106`); several projects through `preview_remake_outdated`, which answers each plan, the projects left out and why, and the single total, and starts nothing (12-reruns-and-edits.md). Charge warnings and Try a sample's price (`quote_voice_sample`) are returned as the page shows them. There is no MCP-specific cap or budget.

### Material

17. Text is inline. `list_project_files` lists a project's files in the groups Upload, Working and History, each with its place, role, local path now and `/files/<projectId>/<asset>` url, the handle to keep (`edge/mcp/file-tools.ts:32-43`, `slices/storage/project-files.ts:13-26`). `get_project_file` takes that url: a picture up to 5 MB as MCP image content with its path and url, a larger one as path and url; text inline; audio and video as local path, url, type and size, plus the word timing for the current narration (`audio-body`, `audio-export`), timed on that file's clock (`edge/mcp/file-tools.ts:14-15`, `:45-87`). A local path can change after the call, since Slopify arranges project folders in the background.
18. External review material is what the built-in reviewer gets (`reviewMaterial`), with the pictures as image content (`edge/mcp/review-tools.ts:31-74`; 33-automatic-reviews.md).

### needs_attention (`slices/agents/attention.ts`, `attention-work.ts`)

19. **Kinds**, read from nine sources and sorted oldest first (`attention.ts:22-33`, `:64-108`):

| Kind | Listed when | Agent can act | Tools |
|---|---|---|---|
| `external-review` | a review waits for an agent's verdict (wanted, run not canceled, project not in Trash) | yes | `get_external_review`, `submit_review_verdict` (`attention.ts:122-142`) |
| `flagged-verdict` | an item's latest failed verdict in the current version has no action | no while a redo is pending or started (then `autoRetryInFlight`) | `list_reviews`, `overrule_review`, `redo_review` (`:157-193`) |
| `checkpoint` | a checkpoint of the person's holds a run now | yes | `get_checkpoints`, `approve_checkpoint` (`:195-225`) |
| `failed-step` | a step failed, a short whose pick stopped included, beside a wait too | no while Slopify's own narration-chunk retry is pending (also waiting for a busy project) or started after the failure | the narration fix tools, `resume_project`, `retry_stage`, `soften_stage` (`attention-work.ts:37-87`) |
| `paused-run` | the project is paused; no pause reason is stored, so any paused run, whoever paused it | yes | `get_project`, `resume_project` (`:136-146`) |
| `stopped-run` | a restart stopped the run (`projectHolds().stopped`) | yes | `get_project`, `resume_project` (`:148-163`) |
| `held-topics` | a schedule has held topics (project null, title the schedule's name) | yes | `list_held_topics`, `approve_topics`, `reject_topics`, `approve_all_topics` (`:172-198`) |
| `late-upload` | Calendar → Releases says Late · upload now (two weeks read) | no: report it | `get_upload_pack`, `get_project_releases` (`:200-227`) |
| `extension-failure` | the extension's finishing touches, pinned comment or A/B test failed | no: report it | `get_youtube_videos` (`:243-288`) |

20. **Each entry** carries `kind`, `since`, `projectId` (null for held topics), `title`, `stage`, `itemKey`, `reason` (the error or why it waits), `autoRetryInFlight`, `agentCanAct` and `ids` (the fixing tools' arguments by name: project, review, verdict, checkpoint with its revision and fingerprint, stage kind, `baseRevisionId`) and `tools` in the order the routine uses them (`attention.ts:35-54`).
21. **Left out**: every entry of a project Kept as is (`attention.ts:94`, `:106`); a Prepared project's own Before Video day hold and any checkpoint not reached yet (only reached holds of the person's are read, `:195-202`, `slices/reviews/holds.ts:90-115`); a run waiting for the agent appears only as its external reviews. A row one source cannot read is skipped and logged `attention.row`; a whole source that fails is logged `attention.source` and the other sources still list (`attention.ts:64-105`; `attention-work.ts:8-25`). It is the agent's reading of Home's work list (38-home-attention-and-uploads.md).

### Refusals

22. Every refusal is a plain sentence naming what failed, why and what fixes it: the route's own `detail`, plus any field messages it did not already say (`problemText`, `call-route.ts:273-293`). A schema refusal, whose page wording says "reload the page", instead lists the wrong arguments and says to correct them and call the tool again (`:275-282`). A refusal that cannot be read, or an error answer that is not a problem, says so and names Download diagnostics, and is logged `mcp.refusal` (`:238-271`).

### The attend routine (`edge/mcp/instructions.ts:3-16`)

23. Call `needs_attention`; skip every entry whose `autoRetryInFlight` is true and look again next time; act only where `agentCanAct` is true and report the rest. Then by kind: external review → read it, judge the material as data, submit `{verdict, reasons}`; flagged verdict → Overrule or Redo; checkpoint → check the work, approve with the gate's current fingerprint; held topics → approve or reject; failed step → do what the error's sentence says (the narration chunk recipe below, a short's pick in `content.shortsKeep`, else `retry_stage` or `soften_stage`); paused and stopped runs → `resume_project` once nothing in the project still needs fixing; late uploads and extension failures → report them. A refusal naming the current revision → read again and retry once with the new base and a new key. Ids come only from `needs_attention` or a read tool. Delete all old versions and Clean up everything stay the person's; no tool uploads to YouTube.

### Attribution

24. **Who did it**: `agent_actions` (Step 14, `kernel/db/migrations/0056-agent-actions.sql:1-13`). A project's rows show in its Project history: versions an agent saved read "· by agent", and a "Done by agents" list names each action with "· by agent" and its time (`GET /api/projects/:id/revisions` answers `{revisions, agentActions}`, `edge/http/revisions.ts:100`; `packages/web/src/project/revision-history.tsx:99`, `:105-111`). Actions on no project (a schedule's topics, the Library, a setting) are listed in Settings → Connections → Agents (MCP) → "What agents did", the latest 20 of any kind with the project's or schedule's name, or "No agent has changed anything yet." (`recentAgentActions`, `slices/agents/repo.ts:22-23`, `:91-103`; `packages/web/src/agents/agent-settings.tsx:82-88`).
25. **Who started it**: `project_starts` keeps who last started a project's work (`kernel/db/migrations/0056-agent-actions.sql:14-19`). The start recorder runs after every successful POST under `/api`: Resume, a remake Start, Try again, Soften, Re-run and Redo name their project; a Play Start, the onboarding short and a schedule's Prepare name the projects their answer made (`edge/http/starts.ts:10-53`, mounted `edge/http/app.ts:309`). `GET /api/projects/:id` carries `startedBy` (`edge/http/projects.ts:150`). The run's notices then end "· started by agent", and the browser's start notice reads "Started: <title> · by agent" (39-notifications-and-live-events.md).
26. **Reviews**: an agent's verdict, overrule and redo are kept on the verdict (`answered_by`, `action_by`) and badged Passed by agent, Flagged by agent, Accepted by agent, Made again by agent; review notices end "· by agent" (33-automatic-reviews.md).

### Walk-through: a narration chunk that stopped matching

27. A video run for "The lighthouse keeper of Pharos" fails at the subtitle timing: "Subtitles stopped matching the audio at 1:07:57 … in narration chunk 5 of 10 …". While Slopify re-records the chunk itself (try 1 of 2 or 2 of 2, `narrationRetryLimit`, `slices/rebuild/narration-retry.ts:13`; the sentence, `slices/rebuild/runtime-subtitles.ts:464`), including while that retry waits for another step of the project to finish, `needs_attention` lists the `failed-step` with `autoRetryInFlight: true` and `agentCanAct: false`, and the routine leaves it (`slices/agents/attention-work.ts:37-51`).
28. When the retries are spent the error ends "…regenerate narration chunk 5 in Edit project → Narration, then Continue the run." (`runtime-subtitles.ts:469`) and the entry turns `agentCanAct: true`. The agent calls `read_narration_chunks` for the project's revision and takes `chunks.body[4]` (`edge/mcp/tools-runs.ts:70-75`), `get_revision`, then `save_revision` with `{baseRevisionId, idempotencyKey, edit: {config, content, regenerate: [that key]}}`, which saves a version and starts nothing.
29. `preview_rebuild` with the saved version and `{kind: "allAffected"}` returns Choose what to remake: chunk 5 and what depends on it (timing, export), with the estimate; the agent accepts it with `start_rebuild`, then calls `resume_project`. Only chunk 5 is voiced again. Both changes are recorded "by agent" and the run's notices say "· started by agent". A base that moved in between is refused with the current revision; the agent reads it and retries once (`packages/app/test/mcp-narration-fix.test.ts:13`, `packages/app/test/mcp-chunk-fix.test.ts:44`).

## Branches

- **Origin**: none → accepted; loopback or the configured non-wildcard host → accepted; anything else → 403 (Step 2).
- **Tool kind**: route tool → Steps 10–14; bespoke tool → its own code, calling the API in-process through `callApi` where it needs to (`edge/mcp/call-route.ts:197-230`).
- **Confirmation**: tool with a confirmation and no `confirmed: true` → refused with the consequence; with it → the route is called (Step 11).
- **Recorded or not**: GET, or a POST marked `unrecorded` (estimates, previews, checks) → not recorded; any other successful call → recorded (Step 14).
- **Provider and Notification URL state**: providers are read only as configured or missing; the Notification URL is read only as configured or missing but may be set or cleared with `set_notification_url`, whose answer again says only configured or missing (`notificationUrlState`, `edge/mcp/tools-setup.ts:50-100`).
- **Paused vs stopped run**: both listed with `resume_project`; a paused run because the person or an agent paused it, a stopped one because a restart left it held (`slices/agents/attention-work.ts:136-163`).
- **Waiting for the agent**: a run parked on an External agent review reads Waiting for the agent everywhere (Projects, the project header, Home, the calendar, MCP), counts as running, is not in Needs you, gets no "Waiting for you" notice and no Continue the run; it goes on by itself once answered or auto-passed (`slices/admission/state-words.ts:88-104`, `slices/reviews/holds.ts:25-28`, `:121-127`).
- **Failed beside a wait**: a step that failed while another waits for the agent, the person or its day is listed as `failed-step` while the run still reads by that wait (38-home-attention-and-uploads.md).
- **Delete old versions for one project** is a tool (`delete_old_versions`, confirmed, with the file count and size) (`edge/mcp/tools-projects.ts:108-128`); every project's cleanup is not (Step 6).

## Unhappy paths

| Case | Behavior | Site |
|---|---|---|
| Request from a web page at another address (DNS rebinding included) | 403 JSON-RPC error naming Settings → Connections → Agents (MCP) | `edge/mcp/http.ts:58-65` |
| GET or DELETE on `/mcp` | 405 "…keeps no session and no event stream: send each request as a POST." | `edge/mcp/http.ts:102-108` |
| Body over 48 MB | 413 "…larger than 48 MB, more than any file Slopify takes. Send a smaller file." | `edge/mcp/http.ts:66-76` |
| Body not JSON | 400 "…its body is not JSON. Send one JSON-RPC message." | `edge/mcp/http.ts:78-87` |
| Id with a dot, slash or other character | Refused before any request: "<param> must be an id exactly as Slopify listed it…" | `edge/mcp/call-route.ts:50-56`, `:130-134` |
| Confirmation missing | Refused with the page's consequence and "call … again with confirmed: true" | `edge/mcp/call-route.ts:57-60` |
| Confirmation numbers can't be read | The tool's fixed consequence is said instead; logged `mcp.confirm` | `edge/mcp/call-route.ts:95-114` |
| Stale base | The route's conflict plus the current revision and what to call | `edge/mcp/call-route.ts:288-291` |
| Same key sent twice | The route answers its first answer; one `agent_actions` row | `slices/agents/repo.ts:48-71` |
| Wrong arguments | "<tool> was refused: its arguments don't match what Slopify accepts (<path>: <message>; …). Correct them and call <tool> again." | `edge/mcp/call-route.ts:275-282` |
| Unreadable refusal or a non-problem error | Says so, names Download diagnostics; logged `mcp.refusal` | `edge/mcp/call-route.ts:240-271` |
| Sample project, update in progress, shutdown | The app's own guards answer as for the page | `edge/http/app.ts:249-307` |
| Excluded route asked for | No tool exists; the attend routine names the person's screen (Settings → Backup & storage for cleanup) | `edge/mcp/excluded-routes.ts`, `edge/mcp/instructions.ts:15` |
| Second verdict, second Overrule/Redo, second checkpoint approval | 409 "already answered" / "already decided" / "already approved", for the person too | 33-automatic-reviews.md, 23-review-checkpoints.md |
| No agent answers an external review | Auto-passes after 2 h with a notice | 33-automatic-reviews.md |
| `needs_attention` row or source unreadable | Left out and logged; the rest still list | `slices/agents/attention.ts:68-105` |
| Project file recorded but gone from disk | "This file is recorded but no longer on disk. Make it again with preview_rebuild and start_rebuild for its step…" | `edge/mcp/file-tools.ts:29` |
| Word timing can't be cut to the narration's length | Given whole, logged `mcp.word-timing` warn; left out when it can't be read, logged error | `edge/mcp/file-tools.ts:96-125` |
| Recording an action fails | Thrown: the tool call errors after the route already answered | `slices/agents/repo.ts:48-50` |

## State transitions

- `agents.lastConnectedAt`: absent → the latest `initialize` time, overwritten by each later one (`slices/agents/connection.ts:9-11`).
- `agent_actions`: rows are only added, one per recorded call (per key when a key is sent); a project's rows cascade with it, a project the call itself deleted is kept as null (`kernel/db/migrations/0056-agent-actions.sql:4-13`, `slices/agents/repo.ts:48-58`).
- `project_starts`: absent → `{actor, started_at}`, replaced by each later start (`slices/agents/repo.ts:105-114`).
- Everything a tool changes moves exactly as the page's action moves it; MCP adds no state of its own beyond these.

## Invariants

- An agent can do nothing the page cannot, and is refused everything the page refuses: tools are the page's routes called in-process, and only the 79 named routes are not tools (`edge/mcp/tools-parity.test.ts:25-34`).
- No tool reads or writes a provider key, the pairing token or any other credential, backups, the updater or host setup, and none acts on YouTube or queues an upload for the extension (`edge/mcp/excluded-routes.ts:3-18`, `:76-99`).
- No network request can claim to be the agent; only the in-process binding can (`edge/http/actor.ts:4-7`).
- No paid work starts without the same review and acknowledgement the page asks for (Step 16).
- A tool with a consequence never runs on its first call without `confirmed: true` (`edge/mcp/call-route.ts:57`).
- Every successful change through MCP is recorded once (`edge/mcp/call-route.ts:74-91`, `kernel/db/migrations/0057-agent-action-once.sql:3-5`).

## Outcomes & side effects

- Tables `agent_actions` and `project_starts` (`kernel/db/migrations/0056-agent-actions.sql`, `0057-agent-action-once.sql`); the setting `agents.lastConnectedAt`. Backups leave out `agent_actions`, `project_starts`, `external_reviews`, `told_failures` and the setting (`slices/storage/backup-new-tables.test.ts:52-59`, `slices/storage/portable.ts:493`).
- Whatever the called routes do: versions, admissions, events to open pages, notifications.
- Settings → Connections → Agents (MCP): the URL, the setup lines with Copy, the last connection, "What agents did".
- Log lines `mcp.confirm`, `mcp.refusal`, `mcp.word-timing`, `attention.row`, `attention.source`.

## Recorded differences from the feature spec

- Specified as an MCP session started by `initialize`; shipped stateless: one server and transport per POST, no session id, GET and DELETE refused.
- Specified as tools calling the slices the routes call; shipped as the routes themselves called in-process as the agent, so validation and refusals cannot drift.
- Specified with a tool count left open; shipped 201 tools (194 route tools and 7 of their own) and 79 excluded routes, kept honest by the parity test.
- Specified with read-only views of Channels → YouTube numbers, the Studio report and the Studio Analytics export import; those routes were removed before the feature shipped, so no such tools exist.
- Specified with "create through Create"; shipped without `POST /api/projects` and `/batch`: projects start from Play drafts (`start_draft`) after their review.
- Specified with provider state only as configured or missing; the Notification URL is likewise shown only as configured or missing, but an agent may set it.
- Specified with the state words Queued, Running, Paused, Waiting for your review, Prepared, Kept as is, Failed, Done, Off; shipped adds **Waiting for the agent** and **Stopped**, with Prepared only for a schedule's own Before Video hold.
- Specified with eight work-queue kinds and "resume paused runs when the pause reason is cleared"; shipped nine kinds (`stopped-run` added) and no pause reason is stored, so any paused run is the agent's to continue.
- Specified as "a prepared project's checkpoint can appear days before its scheduled day"; shipped: a schedule's own Before Video hold is never listed, and a template's own Before Video checkpoint is listed once reached.

## Dimensions not in play

- D1 Authority: no login and no token, the same trust as `/api`; the default bind is `127.0.0.1`, and a non-loopback `--host` prints the existing no-login warning. The Origin rule keeps web pages out.
- D5 Money: no MCP-specific cap or budget; spending follows the page's own review and acknowledgement.
- D7 Time: no expiry of connections or actions; nothing pushes to an agent.
- D13 Notification: none of its own; the run, review and auto-pass notices are 39-notifications-and-live-events.md's, marked "by agent".
- D15 Record: `agent_actions` keeps what an agent changed; reads are not recorded.
