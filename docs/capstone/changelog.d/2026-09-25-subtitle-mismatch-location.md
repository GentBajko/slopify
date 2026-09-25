# Subtitle mismatches name the chunk

- When captions fail because the audio stops matching the text, the error now says where: the time into the narration, which narration chunk (for example "chunk 9 of 10", with its opening words), the words the text expected and what the audio had, and to regenerate that chunk in Edit project → Narration. Before, it only said the audio did not closely match.
- The Narration editor lists only the current chunks, in spoken order, so its numbers match the error. It used to also list chunks from an older narration, in storage order.
- A chunk queued for regeneration says so, with a Keep button to take it back.
