-- The cast's own order (3.10.0): the Cast tab and every list of a channel's cast follow it, and
-- Move up / Move down change it. Members made before this keep the alphabetical order they were
-- shown in; a new member goes last.
ALTER TABLE cast_members ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
UPDATE cast_members SET position = (
  SELECT count(*) FROM cast_members other
  WHERE other.channel_id = cast_members.channel_id
    AND (lower(other.name) < lower(cast_members.name)
      OR (lower(other.name) = lower(cast_members.name) AND other.id < cast_members.id))
);
CREATE INDEX cast_members_order ON cast_members(channel_id, position);
