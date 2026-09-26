# Telemetry for shorts

- Each rendered short is reported as `shorts: 1` with no stage: the Shorts step runs inside the Video stage, and a stage of "video" would count as a finished video. The first-run notice lists "Shorts made".
- The collector counts `shorts_made` (a new key in the `aggregates` table; no schema change) and the landing board shows it as "shorts made".
- `02-models.md`: TelemetryCounters/TelemetryPayload gain `descriptions` and `shorts`; Aggregates gains `documents_made`, `descriptions_made` and `shorts_made`.
