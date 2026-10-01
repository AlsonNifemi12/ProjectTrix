import { randomBytes } from "node:crypto";

import { pool } from "../../config/database.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";

type GitLabTokenResponse = {
  access_token?: string;
  token_type?: string;
};

type GitLabUser = {
  id: number;
  username: string;
  name: string;
  avatar_url: string | null;
  web_url: string;
};

export type AppUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  gitlabProfileUrl: string;
  bio: string;
  skills: string[];
};

export function assertGitLabConfigured() {
  if (!env.GITLAB_CLIENT_ID || !env.GITLAB_CLIENT_SECRET) {
    throw new HttpError(
      503,
      "GITLAB_AUTH_NOT_CONFIGURED",
      "GitLab sign in has not been configured on this server.",
    );
  }
}

export function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/projects";
  }
  return value.slice(0, 500);
}

export function createOAuthState(returnTo: string) {
  const state = randomBytes(32).toString("base64url");
  const encodedReturnTo = Buffer.from(returnTo, "utf8").toString("base64url");
  return { state, cookieValue: `${state}.${encodedReturnTo}` };
}

export function readOAuthState(cookieValue: unknown, returnedState: unknown) {
  if (typeof cookieValue !== "string" || typeof returnedState !== "string") return null;
  const [expectedState, encodedReturnTo] = cookieValue.split(".", 2);
  if (!expectedState || !encodedReturnTo || expectedState !== returnedState) return null;

  try {
    return safeReturnTo(Buffer.from(encodedReturnTo, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function buildGitLabAuthorizationUrl(state: string) {
  const url = new URL("/oauth/authorize", env.GITLAB_BASE_URL);
  url.searchParams.set("client_id", env.GITLAB_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GITLAB_CALLBACK_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "read_user");
  return url.toString();
}

export async function exchangeGitLabCode(code: string) {
  const tokenUrl = new URL("/oauth/token", env.GITLAB_BASE_URL);
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GITLAB_CLIENT_ID,
      client_secret: env.GITLAB_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.GITLAB_CALLBACK_URL,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as GitLabTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new HttpError(502, "GITLAB_TOKEN_EXCHANGE_FAILED", "GitLab sign in could not be completed.");
  }

  return body.access_token;
}

export async function fetchGitLabUser(accessToken: string) {
  const userUrl = new URL("/api/v4/user", env.GITLAB_BASE_URL);
  const response = await fetch(userUrl, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json().catch(() => ({}))) as GitLabUser;
  if (!response.ok || !body.id || !body.username) {
    throw new HttpError(502, "GITLAB_PROFILE_FAILED", "The GitLab profile could not be loaded.");
  }
  return body;
}

export async function upsertGitLabUser(gitlabUser: GitLabUser) {
  const result = await pool.query<AppUser & { display_name: string; avatar_url: string | null; gitlab_profile_url: string }>(
    `INSERT INTO users (gitlab_id, username, display_name, avatar_url, gitlab_profile_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (gitlab_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url,
       gitlab_profile_url = EXCLUDED.gitlab_profile_url,
       updated_at = NOW()
     RETURNING id, username, display_name, avatar_url, gitlab_profile_url, bio, skills`,
    [String(gitlabUser.id), gitlabUser.username, gitlabUser.name || gitlabUser.username, gitlabUser.avatar_url, gitlabUser.web_url],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(500, "USER_UPSERT_FAILED", "The user account could not be saved.");
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    gitlabProfileUrl: row.gitlab_profile_url,
    bio: row.bio,
    skills: row.skills,
  };
}

export async function getUserById(id: string) {
  const result = await pool.query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    gitlab_profile_url: string;
    bio: string;
    skills: string[];
  }>(
    `SELECT id, username, display_name, avatar_url, gitlab_profile_url, bio, skills
     FROM users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    gitlabProfileUrl: row.gitlab_profile_url,
    bio: row.bio,
    skills: row.skills,
  };
}
