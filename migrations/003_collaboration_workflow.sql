ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS repository_url TEXT;

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES project_roles(id) ON DELETE SET NULL,
  join_request_id UUID UNIQUE REFERENCES join_requests(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_members_project_id_idx
  ON project_members (project_id);

CREATE INDEX IF NOT EXISTS project_members_user_id_idx
  ON project_members (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS project_members_filled_role_idx
  ON project_members (role_id)
  WHERE role_id IS NOT NULL;
