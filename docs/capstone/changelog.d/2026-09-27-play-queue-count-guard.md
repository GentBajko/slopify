# Play starts exactly the videos its button counts

- Play's Start button now counts the videos from the same reviewed receipt that Start runs, so "Queue 3 videos" can no longer start a single video. If the review of the saved draft covers a different number of videos than the page shows, Play says so ("The saved draft has 1 video, but this page shows 3…"), saves the page again with its keyword variations and asks for Refresh review before Start.
- The server refuses a Start that would create a different number of projects or queue entries than were reviewed; nothing is created, the draft stays editable, and the person is asked to review again.
