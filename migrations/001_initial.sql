CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  gitlab_id TEXT NOT NULL UNIQUE,
  username VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  gitlab_profile_url TEXT NOT NULL,
  bio VARCHAR(500) NOT NULL DEFAULT '',
  skills TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  summary VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  technologies TEXT[] NOT NULL,
  difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  status VARCHAR(20) NOT NULL DEFAULT 'RECRUITING'
    CHECK (status IN ('DRAFT', 'RECRUITING', 'IN_PROGRESS', 'COMPLETED')),
  expected_duration VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_roles (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  description VARCHAR(300) NOT NULL DEFAULT '',
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS join_requests (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_id UUID REFERENCES project_roles(id) ON DELETE SET NULL,
  applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message VARCHAR(1000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS projects_created_at_idx ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON projects (owner_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);
CREATE INDEX IF NOT EXISTS projects_technologies_gin_idx ON projects USING GIN (technologies);
CREATE INDEX IF NOT EXISTS project_roles_project_id_idx ON project_roles (project_id);
CREATE INDEX IF NOT EXISTS join_requests_project_id_idx ON join_requests (project_id);
CREATE INDEX IF NOT EXISTS join_requests_applicant_id_idx ON join_requests (applicant_id);
