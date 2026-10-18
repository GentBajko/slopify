---
scenario: remote-access-and-request-guard
screens:
- 08-settings
depends_on:
- 20-boot-cli-recovery
- 21-app-updater
- 32-studio-upload-prep
- 43-autostart
- 44-studio-autopilot
- 45-mcp-agent-access
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 53b7f2a94d18
paths_covered:
  - ":(top)packages/app/src/edge/remote-access/**"
  - ":(top)packages/app/src/edge/http/remote-access.ts"
  - ":(top)packages/app/src/edge/http/remote-guard.ts"
  - ":(top)packages/app/src/edge/http/request-guard.ts"
  - ":(top)packages/app/src/edge/http/same-page.ts"
  - ":(top)packages/app/src/edge/http/app.ts"
  - ":(top)packages/app/src/edge/mcp/http.ts"
  - ":(top)packages/app/src/kernel/config/**"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/remote-access/**"
---

# 53 Remote access and the request guard

Slopify has no login. What a request may do rests on where it came from, so every request to `/api` passes the same layers before any route runs, and a person who wants Slopify on a phone or another computer turns on **remote access**: Slopify has the Tailscale already on the computer serve its page at `https://<computer>.<tailnet>.ts.net`, for the devices signed in to the person's tailnet only. Slopify itself keeps listening on `127.0.0.1`. This chapter covers the switch in Settings → General → Remote access, the Tailscale commands behind it, and the guards: the public-internet refusal, the Host check, the same-page rule for changes, the Tailscale-account check, the actions kept for the computer Slopify runs on, and the agents' own endpoints. Paths starting `edge/`, `kernel/` or `slices/` are under `packages/app/src/`; web paths are under `packages/web/src/`.

## Trigger & preconditions

| Behavior | Trigger | Preconditions |
|---|---|---|
| Read remote access | Settings → General → Remote access opens (`web/src/remote-access/remote-access-settings.tsx:30-34`, `web/src/routes/settings-sections.ts:66`, `:109`); `GET /api/settings/remote-access`; agents' `get_remote_access` (`edge/http/remote-access.ts:21-26`, `edge/mcp/tools-setup.ts:60-65`) | A remote-access service exists (a native Slopify, or Docker, which answers its own view); else 404 "Remote access can't be set from this Slopify. Start it with npx @gentbajko/slopify and try Settings → General → Remote access again." |
| Turn it on or off | The switch "Open on my other devices (Tailscale)"; Use port 8443 / 10000; Check again; `PUT /api/settings/remote-access {enabled, httpsPort?}` (`web/src/remote-access/remote-access-settings.tsx:67-73`, `:114-136`, `edge/http/remote-access.ts:27-43`) | The person, on the computer Slopify runs on (Step 9); never an agent or the assistant; port 1-65535 |
| Set up at every start | `remoteAccess.start()` once the server listens (`main.ts:1081-1086`, `edge/remote-access/service.ts:235-244`) | Never awaited: Tailscale's answer does not hold the start |
| Remove at shutdown | `remoteAccess.stop()` with a 5 s deadline (`main.ts:1131-1138`, `:202`, `service.ts:245-253`) | Slopify's own handler exists |
| Guard every request | The middleware chain on the app (`edge/http/app.ts:306-329`) | Every request, from a browser, a proxy or in-process |
| Bind address | `--host` / `SLOPIFY_HOST`, default `127.0.0.1`; a non-loopback host prints a no-login warning (`kernel/config/index.ts:21-25`, `edge/cli.ts:107-111`) | The image's default is `0.0.0.0` (`07-operations.md`) |

## Steps

### Turning remote access on (`edge/remote-access/service.ts`, `rules.ts`, `cli.ts`, `store.ts`)

1. **What Slopify runs.** Only `tailscale status --json`, `tailscale serve status --json`, `tailscale serve --bg --yes --https=<port> <target>` and `tailscale serve --yes --https=<port> off` (`edge/remote-access/cli.ts:17-28`). Serve only, never Funnel: a command whose first word is not `status` or `serve`, or any argument naming Funnel, throws before it runs (`assertServeOnly`, `:30-39`; every run goes through `guarded`, `:41-46`). The command is found on PATH, or at the macOS app bundle or the Windows installer's path (`:49-54`); each call is cut off after 10 s (`:81-93`). The target is Slopify's own loopback address and the port it really got (`loopbackTarget`, `edge/remote-access/views.ts:30-41`: `0.0.0.0`, `localhost` and `127.0.0.1` read as `127.0.0.1`, `::` as `[::1]`).
2. **Diagnose** (`diagnose`, `service.ts:62-81`): `tailscale status --json` (it exits 1 while signed out but still prints the state), then `serve status --json`. The machine is read from the status (`machineOf`, `rules.ts:111-150`): signed out or waiting for approval in the tailnet, not running, or no HTTPS certificates for its name (MagicDNS and HTTPS in the admin console) are problems; otherwise its DNS name and the Tailscale account it is signed in to (`LoginName`) are known.
3. **Apply** (`apply`, `service.ts:104-157`), one change to Tailscale at a time (`serial`, `:193-199`):
   - an address Slopify added earlier is first removed if the port, the target or the machine's name changed;
   - the chosen HTTPS port is looked at (`portUse`, `rules.ts:187-218`, in the background config and in any foreground `tailscale serve` still running): free, exactly one proxy at `/` (Slopify's own, when its target is the one recorded), or something else. Another setting on the port is **port-taken**: Slopify leaves it alone, even one that points at this Slopify, and offers a free port from 443, 8443, 10000 (`freePort`, `model.ts:51-54`);
   - on a free port it runs `serve --bg`, and records `{dnsName, httpsPort, target, owner}` in the settings row `remote-access.applied` (`store.ts:14-22`, `model.ts:58-59`); the switch itself is `remote-access` `{enabled, httpsPort}`;
   - it reads Tailscale again and checks that its handler is there ("Tailscale accepted the command, but Slopify's address isn't in its serve settings." otherwise), and that Funnel is not on for it: if it is, Slopify removes its own setting and says so ("Tailscale Funnel was on for Slopify's address, which would put Slopify on the public internet. Slopify removed its address and refuses every request that comes through Funnel." with the exact `tailscale funnel --https=<port> off` fix).
4. **The view** (`RemoteAccessView`, `model.ts:28-49`, `views.ts`): a state (`off`, `on`, `docker`, `not-installed`, `not-running`, `signed-out`, `https-off`, `denied`, `port-taken`, `funnel`, `not-applied`, `failed`), one plain sentence, the fix (the exact command or place), a link where one helps (Tailscale's download page, the admin console's DNS page), the address while on (`https://<name>` or `https://<name>:<port>`), the suggested free port, the local address and whether this page may change it. The page shows the address with Copy address and a QR code (`web/src/remote-access/qr-code.tsx`, dark on white whatever the theme), the sentence, and for a problem a callout with the fix, Use port N, the link and Check again. Linux's `denied` fix is `sudo tailscale set --operator=$USER`.
5. **A read changes nothing** (`read`, `service.ts:160-191`): off → the off view; on → what Tailscale has now (on, port-taken, funnel, or "The switch is on, but Slopify's address isn't in Tailscale right now." with Check again). Views are shared for 5 s (`cacheMs`), so an open Settings tab and an agent reading it together cost one set of calls.
6. **Off** (`turnOff`, `:209-220`): removes only the handler Slopify added, and only while it is still exactly that (same port, a single proxy to the recorded target); a setting the person changed since is left, logged `remote-access.left`, and forgotten. If Tailscale cannot be reached the view says the switch is off but the address could not be removed yet, that Slopify tries again at every start, and the command to remove it by hand.
7. **Start and stop.** At start the address is put back when the switch is on and a leftover from a crash is removed when it is off (`start`, `:235-244`); a start that ends in a problem is logged `remote-access.start` with its fix. At shutdown the handler is removed and the switch kept, so no proxy points at a port another program could take while Slopify is stopped (`stop`, `:245-253`). Waiting is bounded at 5 s; the next start repairs what is left.
8. **Docker.** With `SLOPIFY_CONTAINER=1` the view is `docker`: not available, not changeable, with "Remote access needs Slopify started on the computer itself (npx @gentbajko/slopify). Or set Tailscale up yourself on the host: tailscale serve --bg --https=443 http://127.0.0.1:<Slopify's port>." (`views.ts:65-73`, `service.ts:161`, `:230`). A `tailscale serve` set up by hand or a reverse proxy in front works with the same guards.
9. **Only on the computer.** `PUT` refuses a caller that is not the person (agents and the assistant: "Remote access is the person's to turn on or off, in Settings → General → Remote access. Agents and the assistant can only read it (get_remote_access)."), and a request that reached Slopify through a proxy (403 "Remote access is turned on or off only on the computer Slopify runs on. Open Settings → General → Remote access there, at http://127.0.0.1 and Slopify's port."). Read over a proxy answers `changeable: false` and the page says "Turn it on or off on the computer Slopify runs on." (`edge/http/remote-access.ts:21-43`, `web/src/remote-access/remote-access-settings.tsx:76-78`).

### The guards, in the order a request meets them (`edge/http/app.ts:306-329`)

10. **Funnel refusal** (`app.ts:307-319`, `edge/http/same-page.ts:87-90`). Tailscale marks every request that came through Funnel (`Tailscale-Funnel-Request`); each one is refused 403 "Slopify doesn't answer the public internet: this request came through Tailscale Funnel. On the computer Slopify runs on, run tailscale funnel status … and open Slopify on your other devices through Settings → General → Remote access instead." This holds even when someone else turned Funnel on, for every path.
11. **Host check** (`requestGuard`, `edge/http/request-guard.ts:66-92`, `hostAllowed`, `:42-59`), for requests made by the person (in-process calls by agents and the assistant are skipped, `actorOf`): the request's `Host` must be a name Slopify answers to: no Host (HTTP/1.0 or in-process); an IP address; `localhost` or `*.localhost`; any `*.ts.net` name (it only resolves inside a tailnet); the address it listens on; the exact remote host it set up; this computer's own name and `<name>.local`; or a name listed in `SLOPIFY_ALLOWED_HOSTS` (comma-separated, read at `main.ts:901-904`). Behind a proxy on this computer the name the browser used is `X-Forwarded-Host` (trusted only from a loopback peer, `forwardedHost`, `same-page.ts:27-31`) and must pass too. This is what stops DNS rebinding, a name a web page controls pointed at `127.0.0.1`. Refusal: 403 `foreign-host` "Slopify refused this request: it was addressed to <name>, a name this Slopify doesn't answer to … If you reach it by this name on purpose, start Slopify with SLOPIFY_ALLOWED_HOSTS=<name>."
12. **Same-page rule for changes** (`request-guard.ts:93-117`, `fromSlopifyPage`, `same-page.ts:64-74`). `GET`, `HEAD`, `OPTIONS`, anything outside `/api/`, and the paired extension's `/api/studio/ext` routes (token and CORS of their own) pass. For any other change:
    - a request that carries an `Origin` must come from Slopify's own page: the origin the server itself has, or the same host:port the browser addressed (the request's `Host` or the first `X-Forwarded-Host`, default ports left out), or exactly `https://<remote host>` when addressed to the remote address. A page at another address names its own host, so it never matches: 403 `foreign-origin` "Slopify refused this request: it came from a web page at another address (…). Changes are made only from Slopify's own page; open Slopify and try again there.";
    - a request with **no** Origin and a body a form can send (`text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`) needs the header `X-Slopify-Client`, else 403 `form-request` ("… it looks like a form another web page sent … A script on this computer can send the header X-Slopify-Client: script."). A JSON body with no Origin (a script) passes.
    A few routes check the same rule again inside, with their own sentence (`fromSlopifyPage` in `edge/http/studio.ts:188-189` for Studio settings, `update.ts:43`, `:58`, `revision-files.ts:93`, `open-folder.ts:33`).
13. **Account and host-only actions** (`remoteGuard`, `edge/http/remote-guard.ts:70-95`), for requests that came through a proxy (`viaProxy`: `X-Forwarded-For` or `-Host`, a Tailscale header, or a `.ts.net` Host, `same-page.ts:79-85`); `/mcp` paths are left to their own sentence:
    - **Only the account that turned it on.** Slopify records the Tailscale login the computer was signed in to when it added its address (`owner`). A request through the serve handler (it has `Tailscale-User-Login`, or the remote host) whose `Tailscale-User-Login` differs is refused 403 "Slopify refused this request: over remote access it answers only the Tailscale account that turned remote access on. Sign in to Tailscale on this device with that account, or open Slopify on the computer it runs on." An address recorded by an older version has no owner and gets the owner added the next time it is applied (`service.ts:135-140`).
    - **Host setup stays on the computer.** Through any proxy these writes are refused 403 `host-only` "<what> only on the computer Slopify runs on, not over remote access: open Slopify there, at http://127.0.0.1 and Slopify's port, and do it there.": saving or removing a provider key, setting a CLI's path, importing a backup, the clean-ups that delete files (cleanup, delete old versions, keep outputs), moving the Files folder, setting the backup folder, installing or activating an update, and Start with this computer (`hostOnlyWrites`, `:19-62`).
14. **Agents' endpoints.** `/mcp` and `/mcp/assistant` answer only requests made on this computer: a request that reached them through a proxy gets a JSON-RPC 403 "Slopify refused this MCP request because it came through Tailscale or another proxy. Agents connect only on the computer Slopify runs on, at http://127.0.0.1:<port>/mcp; remote access in Settings → General is for the Slopify page alone." (`edge/mcp/http.ts:15-16`, `:64-68`, `edge/mcp/assistant.ts:304-307`). Their own Origin rule follows (`originAllowed`, `edge/mcp/http.ts:27-38`): no Origin passes (command-line agents send none); an Origin whose hostname is `localhost`, `*.localhost`, `127.0.0.1` or `[::1]` passes; one equal to the configured, non-wildcard `--host` passes; anything else is refused. The port is not compared, because inside Docker the published port is not known to the app. This rule is separate from, and narrower than, the same-page rule above (45-mcp-agent-access.md Step 2).

## Branches

- **Through the remote address, a hand-made `tailscale serve`, Caddy or nginx**: all pass the same Host and same-page checks; only requests through Slopify's own handler or carrying a Tailscale login are held to the owner account; every proxied request is held to the host-only list.
- **Remote access off**: no remote host is known; a `.ts.net` Host still passes the Host check (a hand-made serve), but the owner check does not apply (no owner recorded) and the host-only list does.
- **Port taken**: the view offers Use port 8443 (or 10000); choosing it saves the port and applies again.
- **Not installed / not running / signed out / HTTPS certificates off / denied**: each is its own state with its own sentence and fix (`rules.ts:58-150`); none throws.

## Unhappy paths

- Tailscale slow: a call over 10 s → "Tailscale didn't answer within 10 seconds. Make sure the Tailscale app or service is running …".
- A serve command refused for certificates → the https-off sentence; refused otherwise → "Tailscale refused: <first line>. Run tailscale status in a terminal to see what Tailscale reports …" (`rules.ts:57-83`, `:255-265`).
- Unreadable `tailscale status --json` / `serve status --json` → "Slopify couldn't read tailscale status --json. Update Tailscale to a current version (tailscale.com/download) …".
- The page opened through the remote address: the switch is disabled and the page says to change it on the computer.
- A host name or origin that is refused: the sentences in Steps 10-13; none of them runs the route.
- Starting with a non-loopback `--host` prints "WARNING: bound to <host> - anyone who reaches this port controls the app and its keys (no login)." (`edge/cli.ts:107-111`). An empty host setting stops the start with "The host setting is empty … Leave it out to use 127.0.0.1" (`kernel/config/index.ts:27-31`).

## State transitions

- Switch `remote-access`: off ↔ on (with its port). `remote-access.applied`: absent ↔ present while Slopify's handler is in Tailscale. Both survive a restart; the handler itself is removed at shutdown and put back at start.
- View state: off → on | one of the problem states; on → off; any → any on Check again.

## Invariants

- Slopify never runs `tailscale funnel` or any command but `status` and `serve`, and refuses every request marked as Funnel traffic whoever turned Funnel on.
- Slopify's own listener never moves: remote access is a Tailscale handler in front of `127.0.0.1`, removed when Slopify stops.
- Only the handler Slopify added is ever removed, and only while it is still exactly that; the person's own serve settings are not touched, and port 443 in use is left alone.
- Turning remote access on or off, and the host-setup writes, are possible only on the computer Slopify runs on; agents and the assistant cannot turn it on or off and reach Slopify only on this computer.
- A change to `/api` is accepted from the Slopify page itself (any address it is served at), from the paired extension on its own routes, or from a script that says so; never from another web page.

## Outcomes & side effects

- Settings rows `remote-access` and `remote-access.applied`; Tailscale's own serve configuration (one HTTPS port, one handler at `/` proxying to the loopback address).
- Logs: `remote-access.start`, `remote-access.stop`, `remote-access.left` (never a key or address of another service).
- Tools: `get_remote_access` (the route's `PUT` is excluded from the agents' tools, `edge/mcp/excluded-routes.ts:8-10`, `:92`).

## Recorded differences from the feature spec

- No feature spec was groomed; the intent is `changelog.d/2026-10-18-remote-access.md` and `07-operations.md`'s `SLOPIFY_ALLOWED_HOSTS` row.
- 44-studio-autopilot.md and 21-app-updater.md describe their page-only routes as "same origin" or "cross-origin POST/DELETE → 403"; the rule is now `fromSlopifyPage`: the server's own origin, the same host:port the browser addressed (through any proxy), or the exact remote https address. 45-mcp-agent-access.md's Origin rule applies to `/mcp` only.

## Dimensions not in play

- D1 Authority: no login. Identity is the Tailscale account for remote access; locally, who the caller is is read from where the request came from (a person's browser, an in-process agent call).
- D5 Money: none.
- D7 Time: the 10 s Tailscale call limit, the 5 s view cache and the 5 s shutdown deadline are all.
- D13 Notification: none; problems show in Settings and the log.
- D15 Record: no history of who connected over remote access; refusals are answers, not stored.
