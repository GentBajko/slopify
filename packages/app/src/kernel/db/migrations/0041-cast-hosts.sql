-- A channel's hosts: cast members marked as the channel's recurring voices. A new podcast or
-- interview draft starts with them as its speakers. Every member made before this is not a host.
ALTER TABLE cast_members ADD COLUMN host INTEGER NOT NULL DEFAULT 0 CHECK (host IN (0, 1));
