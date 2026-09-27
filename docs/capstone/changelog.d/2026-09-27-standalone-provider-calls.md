# Topic generation, episode summaries and cast pictures count on Home

- Topic generation for a schedule, the episode summary written when a project finishes, and a generated cast picture now go through the same retries and timeouts as a stage's provider calls; a closing Slopify or the caller's deadline still stops them.
- What each of them cost is recorded against its schedule or channel (new table `standalone_usage`, migration 0040) instead of a project; the episode summary no longer lands on the finished project's Run cost tab.
- Home's "This week" counts them in calls, spend, unpriced calls and API equivalent, the channel filter narrows them, and CLI plan windows they report update the plan standings.
- Backups carry them.
