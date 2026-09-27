# Templates use the current prompts; titles fill keywords

- A run from a template, a schedule or a batch uses the Library's current prompt (and intro/outro) of the name the template saved; the template's own copy is only the fallback for one since deleted or renamed. Editing a prompt now reaches every template and schedule that names it.
- The project title can name keywords like a prompt, e.g. "History: {{Topic}}". Play asks for them and fills them when the run starts, as schedules already did, so one pattern works for Play, templates and schedules.
- New schedule: "Each topic fills" now offers the keyword the template's title names, even when the template was saved without a value for it.
