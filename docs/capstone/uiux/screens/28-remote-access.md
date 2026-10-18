---
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 8.0.0
content_hash: 91c4e6f02b7d
paths_covered:
  - ":(top)packages/web/src/remote-access"
  - ":(top)packages/web/src/routes/settings.tsx"
  - ":(top)packages/web/src/routes/settings-sections.ts"
  - ":(top)packages/app/src/edge/remote-access/model.ts"
---

# Remote access

## Mode & job
Configure section of Settings, `/settings?section=remote-access`, in the "General" group beside General. One switch has the Tailscale already on this computer serve Slopify's page at `https://<computer>.<tailnet>.ts.net`; the section shows the address with a copy button and a QR code, and each problem with its exact fix (`packages/web/src/remote-access/remote-access-settings.tsx:28-29`, `packages/web/src/routes/settings-sections.ts:66-69`, `packages/web/src/routes/settings-sections.ts:109`).

- Mounted by the Settings screen when the section is `remote-access` (`packages/web/src/routes/settings.tsx:203`).
- Data: `GET` and `PUT /api/settings/remote-access`, one `RemoteAccessView` carrying the state, address, suggested port, summary, fix, link and whether this page may change it (`packages/web/src/remote-access/api.ts:1-29`, `packages/app/src/edge/remote-access/model.ts:31-53`).
- Slopify uses Tailscale Serve only, never Funnel; the section never offers a public address (`packages/app/src/edge/remote-access/views.ts:77-83`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Head | `SectionHead` "Remote access" with the `settings.remote-access` InfoTip (`packages/web/src/remote-access/remote-access-settings.tsx:53`) | `SectionHead`, `InfoTip` |
| Switch | `Switch` "Open on my other devices (Tailscale)"; disabled when Tailscale is unavailable (Docker), when the page was opened through the remote address, or while a change is being asked of Tailscale (`packages/web/src/remote-access/remote-access-settings.tsx:17`, `packages/web/src/remote-access/remote-access-settings.tsx:67-73`) | `Switch` |
| Summary | A `role="status"` `text-small text-ink-2` line with the view's sentence ("Off: Slopify answers only on this computer, at <local address>." or "On: any device in your tailnet can open this address, never the public internet. It works while Slopify runs: Slopify removes it when it stops and adds it back when it starts."), or "Asking Tailscale…" while a change is pending; commands in it are drawn by `CommandText` (`packages/web/src/remote-access/remote-access-settings.tsx:74-79`, `packages/app/src/edge/remote-access/views.ts:74-91`) | `CommandText` |
| Address | When there is an address: a 168 px QR code (dark on white in every theme, labelled "QR code for <address>"), the address in a selectable code box, a secondary "Copy address" button, and "Scan it with your phone's camera. The device must be signed in to the same tailnet." (`packages/web/src/remote-access/remote-access-settings.tsx:85-106`, `packages/web/src/remote-access/qr-code.tsx:1-34`) | `Button`, SVG |
| Problem | A `Callout` whose title is the summary and body the fix. Tone is danger for failed, denied and funnel, otherwise waiting. Actions, only when this page may change the setting: primary "Use port N" for a taken port, a download or admin-console link ("Download Tailscale" / "Open the Tailscale admin console"), and "Check again" (primary when there is no port to suggest) (`packages/web/src/remote-access/remote-access-settings.tsx:19-26`, `packages/web/src/remote-access/remote-access-settings.tsx:107-143`) | `Callout`, `Button`, `FileLink` |
| Docker | In Docker the fix is a plain line under the summary, not a callout (`packages/web/src/remote-access/remote-access-settings.tsx:80-84`) | `CommandText` |

## States
| State | Trigger | Rendered |
|---|---|---|
| Checking | first read pending | `role="status"` "Checking Tailscale…" (`packages/web/src/remote-access/remote-access-settings.tsx:59-64`) |
| Read error | the view cannot be read | danger line "Remote access couldn't be checked: <message>" (`packages/web/src/remote-access/remote-access-settings.tsx:54-58`) |
| Off | switch off | summary names the local address; no address block (`packages/app/src/edge/remote-access/views.ts:74-75`) |
| On | Tailscale serves the address | summary above; QR code, address and Copy address (`packages/app/src/edge/remote-access/views.ts:85-91`) |
| Docker | Slopify runs in a container | switch disabled; the fix says remote access needs Slopify started on the computer itself (`npx @gentbajko/slopify`), or `tailscale serve --bg --https=443 http://127.0.0.1:<Slopify's port>` by hand (`packages/app/src/edge/remote-access/views.ts:70-72`) |
| Not changeable | page opened through the remote address | switch disabled and the summary gains " Turn it on or off on the computer Slopify runs on." (`packages/web/src/remote-access/remote-access-settings.tsx:76-78`) |
| Problem states | `not-installed`, `not-running`, `signed-out`, `https-off`, `denied`, `port-taken`, `funnel`, `not-applied`, `failed` | the Problem callout with that state's own sentence and fix (`packages/app/src/edge/remote-access/model.ts:4-24`, `packages/web/src/remote-access/remote-access-settings.tsx:50`) |
| Port taken | HTTPS 443 is used by another serve setting | summary names the port and what uses it; "Use port N" turns it on at the suggested port (`packages/app/src/edge/remote-access/rules.ts:249`, `packages/web/src/remote-access/remote-access-settings.tsx:114-124`) |
| Funnel | Tailscale Funnel found on Slopify's address | danger callout: Slopify removed its address and refuses Funnel requests; the fix is `tailscale funnel --https=<port> off`, then Check again (`packages/app/src/edge/remote-access/views.ts:78-83`) |
| Change refused | the PUT fails | danger `text-small` line with the server's sentence under the callout (`packages/web/src/remote-access/remote-access-settings.tsx:144-148`) |
| Copied | clipboard write works | success toast "Address copied." (`packages/web/src/remote-access/remote-access-settings.tsx:41-42`) |
| Copy refused | clipboard blocked | error toast "The address wasn't copied: this browser blocked the clipboard. Select it and copy it yourself." (`packages/web/src/remote-access/remote-access-settings.tsx:43-47`) |

## Motion
- None authored. The switch, callout and toast use the kit's own transitions.

## Copy
- Title: "Open on my other devices (Tailscale)"; button labels "Copy address", "Use port N", "Check again", "Download Tailscale", "Open the Tailscale admin console" (`packages/web/src/remote-access/remote-access-settings.tsx:17`, `packages/web/src/remote-access/remote-access-settings.tsx:25-26`).
- Every problem sentence names what failed, why and the exact command or admin-console page to fix it, per the project's plain-errors rule (`packages/app/src/edge/remote-access/rules.ts:62-142`).
- Section meta in the Settings list: "Open Slopify on your phone or laptop through Tailscale, only inside your tailnet." (`packages/web/src/routes/settings-sections.ts:68`).

## Not in play
- A public address or Funnel: absent and refused (`packages/app/src/edge/remote-access/views.ts:78-83`).
- Turning it on or off from the remote address, by the in-app assistant or by an agent: not possible; agents can only read it (`packages/web/src/remote-access/remote-access-settings.tsx:70`).
- Choosing a port by hand: absent; the only port control is "Use port N" for the suggested one (`packages/web/src/remote-access/remote-access-settings.tsx:114-124`).
- Per-device access lists or sign-in inside Slopify: absent; access is whatever the tailnet allows.
- Remote use of the agent endpoints: `/mcp` and `/mcp/assistant` still answer only on the computer Slopify runs on.
