-- Whether an upload reached YouTube: the extension records the video when it fills the Details
-- ('filled'), and confirms it once Studio says it was scheduled or published ('done'). One
-- cancelled, or left as a draft, stays 'filled' and is offered for upload again. A pasted link
-- is 'done', as is every video recorded before this column.
ALTER TABLE youtube_videos ADD COLUMN upload_state TEXT NOT NULL DEFAULT 'done'
  CHECK (upload_state IN ('filled', 'done'));
