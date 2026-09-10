---
generated_at_commit: f4d66867e39f
generated_date: 2026-09-10
content_hash: accbad5ecbe4
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
---

# New run

## Mode & job
Operate surface for configuring and submitting a new video run. Source: packages/web/src/routes/play.tsx:34-45,277-314.

## Composition

Narration chunking offers Whole, Paragraph, Every N words and Every N characters. The selected counted mode displays a numeric field; character mode explains sentence boundaries and oversized-sentence behavior. Options wrap at narrow widths (`packages/web/src/play/chunking.tsx:7`).

The form groups stage controls, prompt/model pickers, uploads, subtitle controls, and the submit action; the title New run is the focal heading. Source: packages/web/src/routes/play.tsx:277-314; packages/web/src/play/pickers.tsx; packages/web/src/play/cue-sheet.tsx.

## States
The form starts with no red errors until touched, marks field-level admission/refusal errors, shows upload pending/error, and opens RunReview before submission. RunReview shows expected article words, calculating/error/known subtotal or total states, per-stage rows, unknown charges, and Start/close actions; BatchEditor adds/removes up to 49 keyword variations. ThinkingPicker shows Model default or supported levels and an unsupported-level message. Source: packages/web/src/routes/play.tsx:61-63,91-138,169-187,197-220; packages/web/src/play/run-review.tsx:104-220; packages/web/src/play/thinking.tsx:6-44.

## Motion
No route-specific motion definition found. Source: packages/web/src/routes/play.tsx:1-340.

## Copy
The primary heading is New run; control labels and messages are supplied by stage and picker components. Source: packages/web/src/routes/play.tsx:277-314.

## Not in play
Permission-denied is not rendered by the route. Source: packages/web/src/routes/play.tsx:45-314.
