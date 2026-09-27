# Schedule topics can set any keyword

- A schedule's topics can be written one per line, as a table with a column per keyword a topic sets itself (such as its word count), or pasted as a YAML or JSON list. Switching between the three keeps every value; a list that doesn't read names the topic and keyword to fix.
- Each topic shows the project title it will make, and Copy as YAML and Export as YAML take the queue out again.
- Saving a schedule refuses a topic that names a keyword the template doesn't use, or a value over 2,000 characters, saying which topic and key. Topics saved before are left as they are.
- The calendar API gives each run its `renderedTitle`, the project title it will get (null while a topic waits for approval or generation), and the schedules list shows it beside the next run.
