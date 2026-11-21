-- A step's attempts, looked up by the step: a save asks whether each earlier step was ever
-- attempted (`slices/rebuild/transition-repo.ts`), and so do admission and recovery. The table
-- had no index on it, so every such question read every attempt ever made. Index only.
CREATE INDEX IF NOT EXISTS attempts_work ON attempts(work_id);
