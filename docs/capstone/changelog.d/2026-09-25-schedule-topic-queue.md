# Schedule topic queue

- A schedule takes a list of topics, one per line, and a keyword for them to fill, such as `{{Topic}}`. Each run starts one project with the first topic, then removes it; the run that uses the last topic completes the schedule. A run that fails before its project starts keeps the topic.
- The other template keywords get fixed values that every run uses (for example word counts 15000 and 18000), prefilled from the template.
- A scheduled project's title is filled from the same keywords, so a template titled `D&D Lore To Sleep To: {{Topic}}` names each project after its topic. The form previews the next project's title.
- Runs no longer start the template's own saved setup alongside every item. Schedules saved with per-item variants become queues: each item runs on its own, titled as before.
- The list shows how many topics are left.
