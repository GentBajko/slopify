# Retries, fix-it buttons, waiting updates and Keep outputs only

- Rate limits, timeouts and dropped calls (a lost connection, a provider server error, a CLI killed mid-run) no longer fail a step: it waits about 2, 4, 8 and 16 minutes, never less than the provider's Retry-After, and runs again by itself. The wait survives a restart. Refusals, rejected keys and unsupported requests fail at once; a rejected key is no longer tried four times.
- A failed step only stops the steps that need it: a failed thumbnail no longer holds the video back, and a run whose video was made ends "done with problems" instead of failed.
- Failed steps show the button that fixes them: Sign in to Codex (with the command and Re-check), Open Settings → Providers → the provider, Free space, Switch model, Edit prompt, and Soften and retry, which has the project's AI model reword a refused image prompt and draws it again.
- Updating while a project runs waits instead of refusing: "Update to X.Y.Z will install when 'Title' finishes", then installs by itself. The Docker launcher waits the same way before it replaces the container.
- Settings → Storage splits each project's size into outputs and working files, and a finished project can Keep outputs only, freeing the space its images and narration parts took. Outputs and uploaded files are never removed.
