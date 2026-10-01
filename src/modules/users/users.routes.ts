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
      gitlab_profile_url: string;
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
    }>(
      `SELECT id, title, summary, status, technologies, created_at
       FROM projects WHERE owner_id = $1 ORDER BY created_at DESC`,
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
          createdAt: project.created_at,
        })),
      },
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
