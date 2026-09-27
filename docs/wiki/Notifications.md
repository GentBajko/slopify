# Notifications

Runs can take a while, so Slopify can tell you when one needs you: in the browser, or on your phone through a Notification URL such as an ntfy topic.

**Where to find it:** **Settings → Notifications**.

## When Slopify notifies you

| Event | Message |
|---|---|
| A run **finishes** | "Video ready", or "Run finished" for a run that makes audio only |
| A run **fails** | The project title and the first line of the reason |
| A run **stops to wait for you** | A review checkpoint is holding the next step, or the work left is waiting for Resume |
| A schedule has **new topics waiting** for approval | For example "5 new topics are waiting for you" |

Pausing or cancelling a run yourself sends nothing, and neither does a project that was already finished when the page loaded. A message holds the project title and what happened, never your keys, prompts or files.

## Turn on browser notifications

Browser notifications work while any Slopify tab is open, in any section, even in the background.

1. Open **Settings → Notifications**.
2. Turn **Browser notifications** on. The browser asks for permission now (never when the page loads). Allow it.
3. Press **Send test notification** to check. You should see "Test notification sent to this browser."

What to expect:

- With several Slopify tabs open you get one notification, not one per tab.
- Clicking a run notification opens the project. Clicking a new-topics notification opens the calendar's **Suggested topics**.
- The setting applies to this browser only. Turn it on in each browser you use.
- Default: off.

### If the browser blocked notifications

If you blocked notifications for Slopify earlier, Slopify says "Notifications are blocked for this site". To fix it:

1. Click the icon left of the address bar and open the site settings.
2. Allow notifications.
3. Reload the page.
4. Turn **Browser notifications** on again.

Some browsers only allow notifications from installed apps. If the test says so, use a Notification URL instead.

## Get notifications on your phone (Notification URL)

A Notification URL works with no Slopify tab open. When a run finishes, fails or waits, Slopify sends that address one `POST` with a short plain-text body, for example:

```
Video ready: Black holes explained
Open the project to watch it.
```

### Set it up with ntfy

1. Install the [ntfy](https://ntfy.sh) app on your phone.
2. Subscribe to a topic with a long random name, such as `slopify-7f3k9q2m8x`. Anyone who knows the name can read it, so treat it like a password.
3. In Slopify, open **Settings → Notifications** and paste `https://ntfy.sh/<your-topic>` into **Notification URL**. Your own ntfy server works too.
4. Press **Save**. Slopify says "Notification URL saved."
5. Press **Send test notification**. The message should arrive on your phone.

To turn it off, clear the field and press **Save**.

### Rules for the address

- Only `http://` and `https://` addresses are accepted, without a user name or password in them.
- Any address that accepts a `POST` works, not just ntfy.
- Each message is sent once, with a 5-second timeout, and is never retried. A failure is written to the log and does not affect the run.
- The address stays on this machine: backups leave it out.
- In [Docker](Docker) the request goes out from the container, so the address must be reachable from there. `localhost` means the container itself.

## Tips

- Turn on both: browser notifications while you are at the computer, ntfy for when you walk away.
- Pair notifications with [Reviews and checkpoints](Reviews-and-Checkpoints) so a run that waits for your review tells you right away.

## Related pages

- [Settings reference](Settings-Reference)
- [Schedules](Schedules)
- [Calendar](Calendar)
- [Reviews and checkpoints](Reviews-and-Checkpoints)
- [Troubleshooting](Troubleshooting)
