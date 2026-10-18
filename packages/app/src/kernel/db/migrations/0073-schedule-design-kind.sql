-- A schedule makes either projects from a project template (every schedule so far) or
-- designed pieces from a design template, one per row of its table ahead of that row's date.
-- `design_ids_json` lists the designs a run made, as `project_ids_json` lists projects.
ALTER TABLE schedules ADD COLUMN template_kind TEXT NOT NULL DEFAULT 'project' CHECK(template_kind IN ('project','design'));
ALTER TABLE schedule_runs ADD COLUMN design_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(design_ids_json));
