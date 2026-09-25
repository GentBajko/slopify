# Clearer errors

Every error a person can see was rewritten to say what failed, the likely cause and exactly what to do, using the names on screen (Settings → Providers, Edit project → Narration, Retry stage, Re-run section, Download diagnostics) or the exact command.

- Stage failures start with the part that failed: "Image 3:", "Narration chunk 9 of 10, part 2 of 2:", "Research topic 4:", "Thumbnail:".
- Provider failures read the same for every provider: a rejected or expired key, no credits, rate limits, a provider outage, a content refusal, a dropped connection or an unreachable network each get their own sentence, with the provider's own words quoted after it. A failed model or voice list in Settings says to refresh the list.
- Internal checks a person cannot act on say "Slopify hit an internal error (…)", ask to retry, and point to Download diagnostics.
- Refusals when saving, starting, resuming, editing or scheduling name the field or button involved; conflicts say the project changed and to reload.
- The page says "Slopify isn't responding" when the app is stopped or restarting, and stops showing raw status codes or validation dumps.
- Terminal messages for installing and starting Slopify: a port in use gives the `--port` command, Docker not installed / not running / permission denied each get their fix, and a database from a newer Slopify says to update.
- Schedule run history shows sentences instead of reason codes such as "spend-limit".
