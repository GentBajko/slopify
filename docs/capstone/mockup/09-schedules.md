# 09 Schedules

`rule: logic (S25-scheduled-jobs)`

The Schedules screen is a durable control room for unattended local runs.

```text
Schedules                                      [Schedules]
Run a saved template while Slopify is open.

New schedule
Name [ Monday morning stories ]   Template [ Stories · v3       ]
Cadence [ Every day              ]   Local time [ 09:00 ]
Timezone [ Europe/Tirane ]         Missed run [ Skip if closed ]
Spend ceiling (cents) [          ]
Keyword variants (optional)
[ Solar Lisbon | topic=solar,place=Lisbon                         ]
                                             [ Save schedule ]

Morning stories                                  [Pause] [History]
Daily at 09:00 · Europe/Tirane · 2 variants
Next: 14 Sep 2026, 09:00 · Active
```

History expands inline and names each run as running, succeeded, failed or skipped. Paused jobs offer Resume; active and paused jobs offer Cancel; completed and canceled jobs offer Delete. Saving never starts a run. The next occurrence is previewed in the selected timezone, while the server remains authoritative.
