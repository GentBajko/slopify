# Remote Access

Open Slopify on your phone, tablet or laptop while it runs on your computer. Slopify uses the [Tailscale](https://tailscale.com) already installed on that computer: one switch, and Tailscale serves Slopify's page at an `https://` address that only devices signed in to your tailnet can open.

**Where to find it:** Settings → **General** → **Remote access** → **Open on my other devices (Tailscale)**.

Default: off.

## Before you start

- Tailscale is installed and signed in on the computer Slopify runs on, and on the device you want to use.
- Your tailnet has **MagicDNS** and **HTTPS Certificates** turned on: in the Tailscale admin console open **DNS** (login.tailscale.com/admin/dns), turn on MagicDNS if it is off, then under **HTTPS Certificates** press **Enable HTTPS**. Slopify tells you when this is missing.
- On Linux, Tailscale lets only root or its *operator* change serve settings. Allow your user once with `sudo tailscale set --operator=$USER`.

## Turn it on

1. Open Settings → **General** → **Remote access**.
2. Turn on **Open on my other devices (Tailscale)**.
3. The address appears, for example `https://mypc.tail1234.ts.net`, with **Copy address** and a QR code.
4. On your phone, scan the QR code with the camera (or open the address in its browser). The phone must be signed in to the same tailnet.

Slopify itself keeps listening only on this computer (`http://127.0.0.1:6969`). Tailscale receives the https request on your tailnet address and passes it to that local address.

## Turn it off

Turn off **Open on my other devices (Tailscale)** on the computer Slopify runs on. Slopify removes the serve setting it added, and nothing else.

A page opened through the remote address shows the switch but can't change it: remote access is turned on or off only on the computer itself.

## What stays private

- **Tailnet only, never the public internet.** Slopify uses Tailscale *Serve*, never *Funnel*. Slopify has no login and holds your provider keys, so a public address is never an option: Slopify never runs `tailscale funnel`, and it refuses every request that Tailscale marks as coming through Funnel, even if someone turns Funnel on by hand.
- **Agents stay on this computer.** `/mcp` (agents) and `/mcp/assistant` (the in-app assistant) answer only requests made on the computer Slopify runs on. Remote access is for the Slopify page alone. Agents can read the setting (`get_remote_access`) but can't turn it on or off, and neither can the assistant.
- **Only Slopify's own address.** The checks that protect actions such as updating, opening folders and the Studio settings accept the page at exactly the address Slopify set up, nothing broader. **Open folder** on a remote device opens the folder on the computer Slopify runs on.

## When Slopify stops and starts

The address works while Slopify runs. When Slopify stops, it removes its serve setting, so the address never points at a port that another program could take while Slopify is stopped; opening it then shows Tailscale's own error. When Slopify starts with the switch on, it adds the address back by itself. If Slopify was stopped without warning (a crash, a power cut), the next start replaces what was left.

## Your own serve settings

Slopify changes only the one serve setting it added, and only while it is still exactly what Slopify set. If you already serve something on HTTPS port 443 (even Slopify itself, set up by hand), Slopify leaves it alone and offers **Use port 8443**, which gives Slopify its own address such as `https://mypc.tail1234.ts.net:8443`. Or remove yours with `tailscale serve --https=443 off` and press **Check again**.

## What the notices mean

| Notice | What to do |
| --- | --- |
| Tailscale isn't installed on this computer | Install it from [tailscale.com/download](https://tailscale.com/download), sign in, then press **Check again**. |
| Tailscale is installed but not running | Open the Tailscale app and connect, or run `tailscale up`, then **Check again**. |
| Tailscale is signed out | Open the Tailscale app and sign in, or run `tailscale up`. |
| Your tailnet has no HTTPS certificates | Admin console → **DNS**: turn on MagicDNS, then **Enable HTTPS** under HTTPS Certificates. |
| Tailscale won't let your user change its serve settings | Linux: `sudo tailscale set --operator=$USER` once, then **Check again**. |
| HTTPS port 443 is already used by another serve setting | **Use port 8443**, or remove the other setting with `tailscale serve --https=443 off`. |
| Tailscale Funnel was on for Slopify's address | Slopify removed its address. Turn Funnel off with `tailscale funnel --https=<port> off`, then **Check again**. |
| The switch is on, but Slopify's address isn't in Tailscale right now | Someone removed it outside Slopify: press **Check again** to add it back. |

## Docker

From inside a container Slopify can't set up Tailscale on the computer itself, so the switch is unavailable there. Start Slopify with `npx @gentbajko/slopify` to use it, or set Tailscale up yourself on the host: `tailscale serve --bg --https=443 http://127.0.0.1:6969` (use Slopify's published port). Set up that way, the address isn't one Slopify made, so updating Slopify, opening folders and the YouTube Studio settings work only on the computer itself.
