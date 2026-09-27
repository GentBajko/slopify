# Run notifications

- New Settings → Notifications section. Slopify tells you when a run finishes ("Video ready: <title>", or "Run finished" for an audio-only run), fails ("Run failed: <title> — <first line of the reason>") or stops to wait for you (a review checkpoint holds the next step, or held work waits for Resume). A pause or cancel you pressed yourself says nothing, and neither does a project that was already finished when the page loaded.
- **Browser notifications**: an Off/On toggle, remembered per browser. Permission is asked only when you turn it on, never on page load. Any open Slopify tab can notify, and only one tab notifies per change. Clicking the notification opens the project. It rides the global event stream the page already holds open, so it adds no connection.
- **Notification URL**: for when no tab is open. The server POSTs a short plain-text body (the title line and a line on what to do) to it, which works with ntfy (`https://ntfy.sh/<topic>`) and any address that accepts a POST. Only http and https URLs without a user name or password are accepted. The request gives up after 5 seconds, is never retried, and a failure goes to the log without affecting the run. The body never includes keys, and the URL is never logged and never goes into a backup.
- Each option has a **Send test notification** button; a failed test says what failed (no answer within 5 seconds, unreachable, or the HTTP status) and where to fix it.
- No schema change: the URL is one row in the existing settings table.
- Guide: `docs/notifications.md`.
