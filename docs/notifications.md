# Notifications

Runs can take hours, so Slopify can tell you when one needs you. It notifies when a run
**finishes** ("Video ready", or "Run finished" for an audio-only run), **fails** (with the
first line of the reason) or **stops to wait for you** (a review checkpoint is holding the
next step, or the work left is waiting for Resume). Pausing or cancelling a run yourself
sends nothing, and neither does a project that was already finished when the page loaded.

Both options live in **Settings → Notifications**, each with a **Send test notification**
button.

## Browser notifications

Turn **Browser notifications** on. The browser asks for permission then, never on page load.
They work while any Slopify tab is open, in any section; with several tabs open you get one
notification, not one per tab. Clicking it opens the project. The choice is remembered per
browser. If the browser blocked notifications earlier, allow them in the site settings (the
icon left of the address bar), reload, and turn the toggle on again.

## Notification URL (no tab open)

Paste an address and press **Save**. When a run finishes, fails or waits, the server sends it
one `POST` with a plain-text body (`text/plain; charset=utf-8`):

```
Video ready: Black holes explained
Open the project to watch it.
```

The body holds only the project title, what happened and the short failure reason; never keys,
prompts or files. The request gives up after 5 seconds and is never retried; a failure is
written to the log and does not affect the run. Only `http://` and `https://` addresses are
accepted, without a user name or password in them.

[ntfy](https://ntfy.sh) takes this body as is: install the ntfy app on your phone, subscribe
to a topic with a long random name, and use `https://ntfy.sh/<that-topic>` (or your own ntfy
server). Anyone who knows the topic can read it, so treat the URL like a password. For that
reason it stays on this machine: backups leave it out.

In Docker the request goes out from the container, so the address must be reachable from
there (`localhost` means the container itself).
