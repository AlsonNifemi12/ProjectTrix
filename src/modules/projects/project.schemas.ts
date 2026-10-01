import { z } from "zod";

import { technologies } from "../../constants/technologies.js";

export const difficultySchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
export const statusSchema = z.enum(["DRAFT", "RECRUITING", "IN_PROGRESS", "COMPLETED"]);
const technologySchema = z.enum(technologies);

export const listProjectsSchema = z.object({
  search: z.string().trim().max(100).optional(),
  technology: technologySchema.optional(),
  difficulty: difficultySchema.optional(),
  status: statusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const projectRoleInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  skills: z.array(technologySchema).max(10).default([]),
  description: z.string().trim().max(300).default(""),
});

export const createProjectSchema = z.object({
  title: z.string().trim().min(5).max(100),
  summary: z.string().trim().min(20).max(180),
  description: z.string().trim().min(50).max(10_000),
  technologies: z.array(technologySchema).min(1).max(8),
  difficulty: difficultySchema,
  expectedDuration: z.string().trim().max(80).optional(),
  roles: z.array(projectRoleInputSchema).min(1).max(10),
});

export const joinRequestSchema = z.object({
  roleId: z.string().uuid(),
  message: z.string().trim().min(20).max(1000),
});
