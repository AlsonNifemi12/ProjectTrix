import { Router } from "express";
import { z } from "zod";

import { pool } from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

const router = Router();

const updateProfileSchema = z
  .object({
    bio: z.string().trim().max(500).optional(),
    skills: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  })
  .refine((value) => value.bio !== undefined || value.skills !== undefined, {
    message: "Provide bio or skills to update.",
  });

router.use(requireAuth);

router.get(
  "/me",
  asyncHandler(async (request, response) => {
    const result = await pool.query<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      gitlab_profile_url: string | null;
      bio: string;
      skills: string[];
      created_at: Date;
    }>(
      `SELECT id, username, display_name, avatar_url, gitlab_profile_url, bio, skills, created_at
       FROM users WHERE id = $1`,
      [request.user!.id],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(404, "USER_NOT_FOUND", "The user profile was not found.");

    const projects = await pool.query<{
      id: string;
      title: string;
      summary: string;
      status: string;
      technologies: string[];
      created_at: Date;
      pending_application_count: string;
      member_count: string;
    }>(
      `SELECT p.id, p.title, p.summary, p.status, p.technologies, p.created_at,
              (SELECT COUNT(*) FROM join_requests jr
               WHERE jr.project_id = p.id AND jr.status = 'PENDING') AS pending_application_count,
              (SELECT COUNT(*) FROM project_members pm
               WHERE pm.project_id = p.id) AS member_count
       FROM projects p WHERE p.owner_id = $1 ORDER BY p.created_at DESC`,
      [request.user!.id],
    );

    response.json({
      data: {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        gitlabProfileUrl: row.gitlab_profile_url,
        bio: row.bio,
        skills: row.skills,
        createdAt: row.created_at,
        ownedProjects: projects.rows.map((project) => ({
          id: project.id,
          title: project.title,
          summary: project.summary,
          status: project.status,
          technologies: project.technologies,
          pendingApplicationCount: Number(project.pending_application_count),
          memberCount: Number(project.member_count),
          createdAt: project.created_at,
        })),
      },
    });
  }),
);

router.get(
  "/me/applications",
  asyncHandler(async (request, response) => {
    const result = await pool.query<{
      id: string;
      status: string;
      message: string;
      created_at: Date;
      updated_at: Date;
      project_id: string;
      project_title: string;
      project_status: string;
      role_id: string;
      role_name: string;
      owner_username: string;
      owner_display_name: string;
    }>(
      `SELECT jr.id, jr.status, jr.message, jr.created_at, jr.updated_at,
              p.id AS project_id, p.title AS project_title, p.status AS project_status,
              r.id AS role_id, r.name AS role_name,
              owner.username AS owner_username, owner.display_name AS owner_display_name
       FROM join_requests jr
       JOIN projects p ON p.id = jr.project_id
       JOIN project_roles r ON r.id = jr.role_id
       JOIN users owner ON owner.id = p.owner_id
       WHERE jr.applicant_id = $1
       ORDER BY jr.updated_at DESC`,
      [request.user!.id],
    );

    response.json({
      data: result.rows.map((row) => ({
        id: row.id,
        status: row.status,
        message: row.message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        project: {
          id: row.project_id,
          title: row.project_title,
          status: row.project_status,
          owner: {
            username: row.owner_username,
            displayName: row.owner_display_name,
          },
        },
        role: { id: row.role_id, name: row.role_name },
      })),
    });
  }),
);

router.patch(
  "/me",
  asyncHandler(async (request, response) => {
    const input = updateProfileSchema.parse(request.body);
    const result = await pool.query<{
      id: string;
      bio: string;
      skills: string[];
    }>(
      `UPDATE users
       SET bio = COALESCE($2, bio),
           skills = COALESCE($3, skills),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, bio, skills`,
      [request.user!.id, input.bio ?? null, input.skills ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(404, "USER_NOT_FOUND", "The user profile was not found.");
    response.json({ data: row, message: "Profile updated" });
  }),
);

export const usersRouter = router;
