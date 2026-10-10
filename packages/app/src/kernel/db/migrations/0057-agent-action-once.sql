-- An agent's call sent again with the same idempotencyKey (a retry after a lost answer) gets its
-- first answer back: it is one change, so it is recorded once.
ALTER TABLE agent_actions ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX agent_actions_once ON agent_actions(tool, COALESCE(project_id, ''), idempotency_key)
  WHERE idempotency_key IS NOT NULL;
