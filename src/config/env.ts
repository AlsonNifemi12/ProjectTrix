import "dotenv/config";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z
      .string()
      .default("postgresql://postgres:postgres@localhost:5432/projecttrix"),
    JWT_SECRET: z.string().default("development-only-secret-change-before-deploying"),
    SESSION_COOKIE_NAME: z.string().default("projecttrix_session"),
    COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
    FRONTEND_URL: z.string().url().default("http://localhost:5173"),
    API_URL: z.string().url().default("http://localhost:4000"),
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    GITLAB_BASE_URL: z.string().url().default("https://gitlab.com"),
    GITLAB_CLIENT_ID: z.string().default(""),
    GITLAB_CLIENT_SECRET: z.string().default(""),
    GITLAB_CALLBACK_URL: z
      .string()
      .url()
      .default("http://localhost:4000/api/v1/auth/gitlab/callback"),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== "production") return;

    if (value.JWT_SECRET.length < 32 || value.JWT_SECRET.includes("development-only")) {
      context.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must contain at least 32 characters in production.",
      });
    }

    if (!value.GITLAB_CLIENT_ID || !value.GITLAB_CLIENT_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["GITLAB_CLIENT_ID"],
        message: "GitLab OAuth credentials are required in production.",
      });
    }
  });

export const env = schema.parse(process.env);
export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
