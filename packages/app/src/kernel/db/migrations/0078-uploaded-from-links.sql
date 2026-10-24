-- The long video on YouTube and the project's "uploaded" mark are one fact
-- (`slices/studio/videos.ts`): saving or confirming the long video's link marks the project
-- uploaded. A long video already on YouTube before that marks its project now, from when its
-- link was recorded; a mark made by hand keeps its own time.
INSERT INTO project_uploads (project_id, uploaded_at)
  SELECT project_id, recorded_at FROM youtube_videos WHERE short = 0 AND upload_state = 'done'
  ON CONFLICT(project_id) DO NOTHING;
