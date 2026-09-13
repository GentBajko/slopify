## 2026-09-13 - groom: review checkpoints
key: groom/2026-09-10-review-checkpoints@Q3

- What: Durable, input-bound review gates for Audio, Images and Video/export, allowing independent branches to continue while a selected stage and its dependents wait.
- Approach: Store checkpoint state and approval fingerprints beside existing admitted work and ask the runner for a dispatch grant; reuse SQLite transactions, revision authority, queue and project controls.
- Alternative rejected: Browser-only flags lose state on restart and cannot protect dispatch across tabs or processes.
- Alternative rejected: Project-wide pause stops independent work and contradicts the accepted hold-only policy.
- Alternative rejected: A mutable stage boolean cannot prove that the approved inputs are the inputs being dispatched.
- Alternative rejected: Automatic approval at cost-review time removes the explicit inspection step.
- Decision: Save persists checkpoint choices without generation; explicit approval is required and is valid only for the reviewed revision and dependency fingerprint.
- Decision: Adding or removing a gate is allowed before its stage starts; running or submitted work keeps its originating authority and requires the existing revision/rebuild flow for changes.
- Out of scope: Reusable templates, scheduled execution, automatic approval, new providers, arbitrary timeline editing and release publication.
