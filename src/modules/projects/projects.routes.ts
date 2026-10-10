import { randomUUID } from "node:crypto";

import { Router } from "express";

import { pool } from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  createProjectSchema,
  joinRequestSchema,
  listProjectsSchema,
  reviewJoinRequestSchema,
  updateProjectSchema,
} from "./project.schemas.js";

const router = Router();

type ProjectListRow = {
  id: string;
  title: string;
  summary: string;
  technologies: string[];
  difficulty: string;
  status: string;
  created_at: Date;
  open_role_count: string;
  owner_id: string;
  owner_username: string;
  owner_display_name: string;
  owner_avatar_url: string | null;
  total_count: string;
};

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const query = listProjectsSchema.parse(request.query);
    const filters: string[] = [];
    const values: unknown[] = [];

    if (query.search) {
      values.push(`%${query.search}%`);
      filters.push(`(p.title ILIKE $${values.length} OR p.summary ILIKE $${values.length})`);
    }
    if (query.technology) {
      values.push(query.technology);
      filters.push(`$${values.length} = ANY(p.technologies)`);
    }
    if (query.difficulty) {
      values.push(query.difficulty);
      filters.push(`p.difficulty = $${values.length}`);
    }
    if (query.status) {
      values.push(query.status);
      filters.push(`p.status = $${values.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query<ProjectListRow>(
      `SELECT
         p.id, p.title, p.summary, p.technologies, p.difficulty, p.status, p.created_at,
         u.id AS owner_id, u.username AS owner_username,
         u.display_name AS owner_display_name, u.avatar_url AS owner_avatar_url,
         (SELECT COUNT(*) FROM project_roles r WHERE r.project_id = p.id AND r.is_open = TRUE) AS open_role_count,
         COUNT(*) OVER() AS total_count
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    const total = Number(result.rows[0]?.total_count ?? 0);
    response.json({
      data: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        technologies: row.technologies,
        difficulty: row.difficulty,
        status: row.status,
        openRoleCount: Number(row.open_role_count),
        owner: {
          id: row.owner_id,
          username: row.owner_username,
          displayName: row.owner_display_name,
          avatarUrl: row.owner_avatar_url,
        },
        createdAt: row.created_at,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const projectId = request.params.id;
    const result = await pool.query<{
      id: string;
      title: string;
      summary: string;
      description: string;
      technologies: string[];
      difficulty: string;
      status: string;
      expected_duration: string | null;
      repository_url: string | null;
      created_at: Date;
      owner_id: string;
      owner_username: string;
      owner_display_name: string;
      owner_avatar_url: string | null;
      owner_gitlab_profile_url: string | null;
    }>(
      `SELECT p.id, p.title, p.summary, p.description, p.technologies,
              p.difficulty, p.status, p.expected_duration, p.repository_url, p.created_at,
              u.id AS owner_id, u.username AS owner_username,
              u.display_name AS owner_display_name, u.avatar_url AS owner_avatar_url,
              u.gitlab_profile_url AS owner_gitlab_profile_url
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       WHERE p.id = $1`,
      [projectId],
    );
    const project = result.rows[0];
    if (!project) throw new HttpError(404, "PROJECT_NOT_FOUND", "The project was not found.");

    const roles = await pool.query<{
      id: string;
      name: string;
      skills: string[];
      description: string;
      is_open: boolean;
    }>(
      `SELECT id, name, skills, description, is_open
       FROM project_roles WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    );

    const members = await pool.query<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      gitlab_profile_url: string | null;
      role_id: string | null;
      role_name: string | null;
      joined_at: Date;
    }>(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.gitlab_profile_url,
              pm.role_id, r.name AS role_name, pm.joined_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       LEFT JOIN project_roles r ON r.id = pm.role_id
       WHERE pm.project_id = $1
       ORDER BY pm.joined_at`,
      [projectId],
    );

    let joinRequestStatus: string | null = null;
    if (request.user) {
      const joinRequest = await pool.query<{ status: string }>(
        `SELECT status FROM join_requests
         WHERE project_id = $1 AND applicant_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [projectId, request.user.id],
      );
      joinRequestStatus = joinRequest.rows[0]?.status ?? null;
    }

    response.json({
      data: {
        id: project.id,
        title: project.title,
        summary: project.summary,
        description: project.description,
        technologies: project.technologies,
        difficulty: project.difficulty,
        status: project.status,
        expectedDuration: project.expected_duration,
        repositoryUrl: project.repository_url,
        owner: {
          id: project.owner_id,
          username: project.owner_username,
          displayName: project.owner_display_name,
          avatarUrl: project.owner_avatar_url,
          gitlabProfileUrl: project.owner_gitlab_profile_url,
        },
        roles: roles.rows.map((role) => ({
          id: role.id,
          name: role.name,
          skills: role.skills,
          description: role.description,
          isOpen: role.is_open,
        })),
        members: members.rows.map((member) => ({
          id: member.id,
          username: member.username,
          displayName: member.display_name,
          avatarUrl: member.avatar_url,
          gitlabProfileUrl: member.gitlab_profile_url,
          roleId: member.role_id,
          roleName: member.role_name,
          joinedAt: member.joined_at,
        })),
        viewer: {
          isOwner: request.user?.id === project.owner_id,
          joinRequestStatus,
        },
        createdAt: project.created_at,
      },
    });
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (request, response) => {
    const input = createProjectSchema.parse(request.body);
    const client = await pool.connect();
    const projectId = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO projects
           (id, owner_id, title, summary, description, technologies, difficulty, expected_duration, repository_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          projectId,
          request.user!.id,
          input.title,
          input.summary,
          input.description,
          input.technologies,
          input.difficulty,
          input.expectedDuration ?? null,
          input.repositoryUrl ?? null,
        ],
      );

      for (const role of input.roles) {
        await client.query(
          `INSERT INTO project_roles (id, project_id, name, skills, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), projectId, role.name, role.skills, role.description],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    response.status(201).json({
      data: { id: projectId, title: input.title },
      message: "Project created",
    });
  }),
);

router.post(
  "/:id/join-requests",
  requireAuth,
  asyncHandler(async (request, response) => {
    const projectId = request.params.id;
    const input = joinRequestSchema.parse(request.body);

    const project = await pool.query<{ owner_id: string }>(
      "SELECT owner_id FROM projects WHERE id = $1",
      [projectId],
    );
    const ownerId = project.rows[0]?.owner_id;
    if (!ownerId) throw new HttpError(404, "PROJECT_NOT_FOUND", "The project was not found.");
    if (ownerId === request.user!.id) {
      throw new HttpError(409, "OWNER_CANNOT_JOIN", "You already own this project.");
    }

    const role = await pool.query<{ id: string }>(
      `SELECT id FROM project_roles
       WHERE id = $1 AND project_id = $2 AND is_open = TRUE`,
      [input.roleId, projectId],
    );
    if (!role.rows[0]) {
      throw new HttpError(422, "ROLE_NOT_AVAILABLE", "The selected role is not available.");
    }

    const requestId = randomUUID();
    const created = await pool.query<{ id: string; status: string }>(
      `INSERT INTO join_requests (id, project_id, role_id, applicant_id, message)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, applicant_id) DO NOTHING
       RETURNING id, status`,
      [requestId, projectId, input.roleId, request.user!.id, input.message],
    );
    const row = created.rows[0];
    if (!row) {
      throw new HttpError(409, "JOIN_REQUEST_EXISTS", "A join request has already been sent.");
    }

    response.status(201).json({ data: row, message: "Join request sent" });
  }),
);

router.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (request, response) => {
    const projectId = request.params.id;
    const input = updateProjectSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const project = await client.query<{ owner_id: string }>(
        "SELECT owner_id FROM projects WHERE id = $1 FOR UPDATE",
        [projectId],
      );
      const ownerId = project.rows[0]?.owner_id;
      if (!ownerId) throw new HttpError(404, "PROJECT_NOT_FOUND", "The project was not found.");
      if (ownerId !== request.user!.id) {
        throw new HttpError(403, "PROJECT_OWNER_REQUIRED", "Only the project owner can update this project.");
      }

      const repositoryProvided = Object.hasOwn(input, "repositoryUrl");
      const updated = await client.query<{
        id: string;
        status: string;
        repository_url: string | null;
      }>(
        `UPDATE projects
         SET status = COALESCE($2, status),
             repository_url = CASE WHEN $3 THEN $4 ELSE repository_url END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, repository_url`,
        [projectId, input.status ?? null, repositoryProvided, input.repositoryUrl ?? null],
      );

      if (input.status === "COMPLETED") {
        await client.query(
          "UPDATE project_roles SET is_open = FALSE WHERE project_id = $1",
          [projectId],
        );
      }
      await client.query("COMMIT");
      const row = updated.rows[0]!;
      response.json({
        data: { id: row.id, status: row.status, repositoryUrl: row.repository_url },
        message: "Project updated",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.get(
  "/:id/join-requests",
  requireAuth,
  asyncHandler(async (request, response) => {
    const projectId = request.params.id;
    const project = await pool.query<{ owner_id: string }>(
      "SELECT owner_id FROM projects WHERE id = $1",
      [projectId],
    );
    const ownerId = project.rows[0]?.owner_id;
    if (!ownerId) throw new HttpError(404, "PROJECT_NOT_FOUND", "The project was not found.");
    if (ownerId !== request.user!.id) {
      throw new HttpError(403, "PROJECT_OWNER_REQUIRED", "Only the project owner can review applications.");
    }

    const requests = await pool.query<{
      id: string;
      status: string;
      message: string;
      created_at: Date;
      updated_at: Date;
      role_id: string;
      role_name: string;
      applicant_id: string;
      applicant_username: string;
      applicant_display_name: string;
      applicant_avatar_url: string | null;
      applicant_bio: string;
      applicant_skills: string[];
    }>(
      `SELECT jr.id, jr.status, jr.message, jr.created_at, jr.updated_at,
              r.id AS role_id, r.name AS role_name,
              u.id AS applicant_id, u.username AS applicant_username,
              u.display_name AS applicant_display_name,
              u.avatar_url AS applicant_avatar_url, u.bio AS applicant_bio,
              u.skills AS applicant_skills
       FROM join_requests jr
       JOIN project_roles r ON r.id = jr.role_id
       JOIN users u ON u.id = jr.applicant_id
       WHERE jr.project_id = $1
       ORDER BY CASE jr.status
         WHEN 'PENDING' THEN 0
         WHEN 'INTERVIEW' THEN 1
         ELSE 2
       END, jr.updated_at DESC`,
      [projectId],
    );

    response.json({
      data: requests.rows.map((row) => ({
        id: row.id,
        status: row.status,
        message: row.message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        role: { id: row.role_id, name: row.role_name },
        applicant: {
          id: row.applicant_id,
          username: row.applicant_username,
          displayName: row.applicant_display_name,
          avatarUrl: row.applicant_avatar_url,
          bio: row.applicant_bio,
          skills: row.applicant_skills,
        },
      })),
    });
  }),
);

router.patch(
  "/:id/join-requests/:requestId",
  requireAuth,
  asyncHandler(async (request, response) => {
    const projectId = request.params.id;
    const requestId = request.params.requestId;
    const input = reviewJoinRequestSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        id: string;
        status: string;
        applicant_id: string;
        role_id: string;
        owner_id: string;
        is_open: boolean;
      }>(
        `SELECT jr.id, jr.status, jr.applicant_id, jr.role_id,
                p.owner_id, r.is_open
         FROM join_requests jr
         JOIN projects p ON p.id = jr.project_id
         JOIN project_roles r ON r.id = jr.role_id
         WHERE jr.id = $1 AND jr.project_id = $2
         FOR UPDATE OF jr, r`,
        [requestId, projectId],
      );
      const joinRequest = result.rows[0];
      if (!joinRequest) {
        throw new HttpError(404, "JOIN_REQUEST_NOT_FOUND", "The application was not found.");
      }
      if (joinRequest.owner_id !== request.user!.id) {
        throw new HttpError(403, "PROJECT_OWNER_REQUIRED", "Only the project owner can review applications.");
      }
      if (["ACCEPTED", "REJECTED", "CANCELLED"].includes(joinRequest.status)) {
        throw new HttpError(409, "JOIN_REQUEST_REVIEWED", "This application has already reached a final decision.");
      }
      if (joinRequest.status === input.status) {
        throw new HttpError(409, "JOIN_REQUEST_UNCHANGED", `This application is already at the ${input.status.toLowerCase()} stage.`);
      }

      if (input.status === "ACCEPTED") {
        if (!joinRequest.is_open) {
          throw new HttpError(409, "ROLE_NOT_AVAILABLE", "This role has already been filled.");
        }
        const member = await client.query<{ id: string }>(
          `INSERT INTO project_members (id, project_id, user_id, role_id, join_request_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (project_id, user_id) DO NOTHING
           RETURNING id`,
          [randomUUID(), projectId, joinRequest.applicant_id, joinRequest.role_id, requestId],
        );
        if (!member.rows[0]) {
          throw new HttpError(409, "ALREADY_A_MEMBER", "This applicant is already a project member.");
        }
        await client.query("UPDATE project_roles SET is_open = FALSE WHERE id = $1", [joinRequest.role_id]);
        await client.query(
          `UPDATE join_requests SET status = 'REJECTED', updated_at = NOW()
           WHERE project_id = $1 AND role_id = $2 AND id <> $3
             AND status IN ('PENDING', 'INTERVIEW')`,
          [projectId, joinRequest.role_id, requestId],
        );
      }

      await client.query(
        "UPDATE join_requests SET status = $2, updated_at = NOW() WHERE id = $1",
        [requestId, input.status],
      );
      await client.query("COMMIT");
      response.json({ data: { id: requestId, status: input.status }, message: `Application ${input.status.toLowerCase()}` });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

export const projectsRouter = router;
