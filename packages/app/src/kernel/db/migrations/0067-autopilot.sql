-- Autopilot warnings the person hid on Home (`slices/autopilot/repo.ts`), each until its week is
-- up; a warning that changes has a new key and shows again.
CREATE TABLE autopilot_snoozes (
 warning_key TEXT PRIMARY KEY,
 until TEXT NOT NULL
);
