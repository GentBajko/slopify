-- How many times a project was paused, and stopped by a restart, so "While you were away" tells
-- a pause or a stop that came again from the one it already saw (`web/src/notifications/away.ts`).
ALTER TABLE project_controls ADD COLUMN pauses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_controls ADD COLUMN stops INTEGER NOT NULL DEFAULT 0;
