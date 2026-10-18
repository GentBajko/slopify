# Remote access with Tailscale

- **Open Slopify on your phone or laptop.** Settings → General → Remote access → **Open on my other devices (Tailscale)** has the Tailscale already on your computer serve Slopify's page at `https://<computer>.<tailnet>.ts.net`, with **Copy address** and a QR code to scan. Only devices signed in to your tailnet can open it.
- **Never the public internet.** Slopify uses Tailscale Serve, never Funnel, and refuses every request Tailscale marks as Funnel traffic. Slopify itself keeps listening only on `127.0.0.1`.
- **Your own serve settings stay yours.** Turning it off removes only the serve setting Slopify added. If HTTPS port 443 is already used, Slopify leaves it alone and offers **Use port 8443**.
- **Only while Slopify runs.** Slopify removes its address when it stops and adds it back when it starts, so it never points at a port another program could take.
- **Plain fixes.** Tailscale not installed, not running or signed out, HTTPS certificates off in the admin console, Linux's `sudo tailscale set --operator=$USER`, a taken port and Funnel each get their own sentence with the exact fix and **Check again**.
- **Agents.** `get_remote_access` reads it; turning it on or off is the person's, and neither agents nor the assistant can. `/mcp` and `/mcp/assistant` still answer only on the computer Slopify runs on.
- **Docker.** The switch needs Slopify started on the computer itself (`npx @gentbajko/slopify`); the page says how to set Tailscale up by hand instead.
