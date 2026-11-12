# This computer renders one video at a time

- **Settings → Production defaults → Videos rendered at once,** one to four, one by default. A render decodes a whole picture track and encodes hours of it, so a second one does not take half the time each: they share the processor, the disk and the memory, and enough of them together leave the app with too little of each to answer the page.
- **A render that has to wait is not refused,** it takes its turn and finishes later. Shorts queue beside long videos, since a short is a render like any other.
- **The audio export does not queue.** It is neither long enough nor heavy enough to be worth holding a place for, so turning narration into a WAV never waits behind a video.
- **The number is read as each render asks for its place,** so raising it lets a waiting render start without a restart, and lowering it takes hold as the renders running now finish.
