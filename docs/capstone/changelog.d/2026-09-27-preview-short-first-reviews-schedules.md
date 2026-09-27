## 2026-09-27 - See it before you make it, the short first, reviews and schedules gaps
key: feat/preview-short-first-reviews-schedules

- Style preview: plays six seconds of the bundled sample project's narration over three of its images (landscape or portrait), with the captions timed to the narration's word timing; a typed sample text is spread over the stretches the narration speaks. The establishing image or cast picture still wins when there is one. Saved previews from before are not reused (preview recipe version 2); project fingerprints are unchanged.
- Shorts preview: under More shorts options on Play and Edit project → Shorts, a 9:16 preview rendered through the Shorts renderer with the caption font, the title on screen and the speed.
- A finished short's next action is Make the full video on this topic: Play opens on a long-video draft with the same topic, starter pack (its template) and providers (`POST /api/onboarding/full-video`).
- Topic generation compares suggestions only with the projects of the schedule's own channel, and a topic of one or two words must match a clause of a title near exactly instead of merely appearing in it.
- Edit on a held topic sets the template's other keywords for its run, checked like the queue's; they go with it into the queue on approval.
- Overrule on a review whose automatic redo is still waiting to start calls the redo off and accepts the item; one already started is still refused.
- Integration tests for the article, narration (the spoken text), thumbnail and shorts reviews, and for Overrule calling off a pending redo.
