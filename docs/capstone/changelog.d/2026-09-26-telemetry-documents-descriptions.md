# Telemetry for PDFs and YouTube descriptions

- The collector counts `documents_made` (a finished document stage, already reported by 2.1.0) and `descriptions_made`. The landing board shows both as "PDFs made" and "descriptions written".
- A written YouTube description is reported with its provider, model and tokens and `descriptions: 1`, and no stage: it is made inside the Video stage, and a stage of "video" would count as a finished video. Its tokens now count toward "tokens used".
- The first-run notice and README list the two new counters.
