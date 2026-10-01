import { randomUUID } from "node:crypto";

import { pool } from "../config/database.js";

async function seed() {
  const userId = randomUUID();
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users
       (id, gitlab_id, username, display_name, avatar_url, gitlab_profile_url, bio, skills)
     VALUES ($1, 'seed-user', 'projecttrix-demo', 'ProjectTrix Demo', NULL,
       'https://gitlab.com/', 'Demo project owner', ARRAY['React', 'Node.js', 'PostgreSQL'])
     ON CONFLICT (gitlab_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [userId],
  );
  const ownerId = user.rows[0]!.id;

  const existingProject = await pool.query<{ id: string }>(
    "SELECT id FROM projects WHERE owner_id = $1 AND title = $2",
    [ownerId, "Accessible Study Planner"],
  );
  if (existingProject.rows[0]) {
    console.log("Seed data already exists.");
    return;
  }

  const projectId = randomUUID();
  await pool.query(
    `INSERT INTO projects
       (id, owner_id, title, summary, description, technologies, difficulty, expected_duration)
     VALUES ($1, $2, $3, $4, $5, $6, 'INTERMEDIATE', '4 to 6 weeks')`,
    [
      projectId,
      ownerId,
      "Accessible Study Planner",
      "A collaborative planner for students who want to organize study sessions.",
      "Build a responsive planner with shared schedules, reminders, roles, and accessible controls for student study groups.",
      ["React", "Node.js", "PostgreSQL"],
    ],
  );
  await pool.query(
    `INSERT INTO project_roles (id, project_id, name, skills, description)
     VALUES ($1, $2, 'Backend Developer', $3, 'Build the API and database queries.'),
            ($4, $2, 'Frontend Developer', $5, 'Build accessible project and schedule screens.')`,
    [randomUUID(), projectId, ["Node.js", "PostgreSQL"], randomUUID(), ["React", "TypeScript"]],
  );
  console.log("Seed data created.");
}

seed()
  .then(async () => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
