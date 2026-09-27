# The Studio extension ships with Slopify, fills uploads one after another and never half-fills

- The Slopify Studio extension is built into the app: Settings → YouTube Studio → Install the Studio extension (and Prepare upload while none is paired) has Download for Chrome or Firefox and three install steps. The root build builds the extension before the app, which serves the zips at `/api/studio/extension/<browser>.zip`.
- Prepare upload checks whether an extension is paired. Unpaired, it shows the install and pair steps, keeps the Copy steps as the upload pack and offers Open YouTube Studio; Fill in YouTube Studio is only offered once paired.
- Fill in YouTube Studio now adds to Waiting for Studio instead of replacing the last choice: each new upload dialog is filled with the next waiting item. Prepare upload lists what waits, with Remove. The list is kept in the settings table per pairing, so a restart keeps it; items wait up to 24 hours and never travel with a backup.
- The playlist can be set per channel in Settings → YouTube Studio; a channel without its own uses the default. No migration: one settings row per channel.
- The extension checks every field the item needs before writing anything. If Studio's dialog lacks one, it fills nothing, copies the whole pack and names the missing fields. Every message with text to paste has a Copy button, with a selectable fallback when the browser refuses the clipboard.
- The extension watches Studio at most every 250 ms and stops watching while a dialog is handled.
- The test fixture's header says honestly which parts come from the live Details editor and which follow the selectors; tests now pin the upload dialog's structure as the selectors describe it.
