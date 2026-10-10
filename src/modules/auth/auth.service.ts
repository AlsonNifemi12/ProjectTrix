import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { pool } from "../../config/database.js";
import { corsOrigins, env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";
import type { RegisterInput } from "./auth.schemas.js";

const scrypt = promisify(scryptCallback);

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
  gitlabProfileUrl: string | null;
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

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, encodedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function mapUser(row: {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  gitlab_profile_url: string | null;
  bio: string;
  skills: string[];
}): AppUser {
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

export async function registerPasswordUser(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);
  try {
    const result = await pool.query<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      gitlab_profile_url: string | null;
      bio: string;
      skills: string[];
    }>(
      `INSERT INTO users (id, email, password_hash, username, display_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, display_name, avatar_url, gitlab_profile_url, bio, skills`,
      [randomUUID(), input.email, passwordHash, input.username, input.displayName],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(500, "USER_CREATE_FAILED", "The account could not be created.");
    return mapUser(row);
  } catch (error) {
    const databaseError = error as { code?: string; constraint?: string };
    if (databaseError.code === "23505") {
      if (databaseError.constraint === "users_email_lower_unique") {
        throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "An account already uses this email address.");
      }
      throw new HttpError(409, "USERNAME_ALREADY_TAKEN", "That username is already taken.");
    }
    throw error;
  }
}

export async function authenticatePasswordUser(email: string, password: string) {
  const result = await pool.query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    gitlab_profile_url: string | null;
    bio: string;
    skills: string[];
    password_hash: string | null;
  }>(
    `SELECT id, username, display_name, avatar_url, gitlab_profile_url, bio, skills, password_hash
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  const row = result.rows[0];
  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
  }
  return mapUser(row);
}

export function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/projects";
  }
  return value.slice(0, 500);
}

function configuredFrontendUrl() {
  const candidates = env.FRONTEND_URL.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return url.toString();
      }
    } catch {
      // Ignore malformed legacy values and try the next configured URL.
    }
  }

  return "http://localhost:5173/";
}

export function safeFrontendUrl(value: unknown) {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      const isSafeProtocol = url.protocol === "https:"
        || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
      if (isSafeProtocol && corsOrigins.includes(url.origin)) {
        url.search = "";
        url.hash = "";
        return url.toString();
      }
    } catch {
      // Fall back to the configured canonical frontend below.
    }
  }

  return configuredFrontendUrl();
}

export function buildFrontendCallbackUrl(frontendUrl: string, returnTo: string) {
  const baseUrl = frontendUrl.endsWith("/") ? frontendUrl : `${frontendUrl}/`;
  const redirect = new URL("auth/callback/", baseUrl);
  redirect.searchParams.set("returnTo", safeReturnTo(returnTo));
  return redirect;
}

export function createOAuthState(returnTo: string, frontendUrl: string) {
  const state = randomBytes(32).toString("base64url");
  const payload = JSON.stringify({
    returnTo: safeReturnTo(returnTo),
    frontendUrl: safeFrontendUrl(frontendUrl),
  });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return { state, cookieValue: `${state}.${encodedPayload}` };
}

export function readOAuthState(cookieValue: unknown, returnedState: unknown) {
  if (typeof cookieValue !== "string" || typeof returnedState !== "string") return null;
  const [expectedState, encodedPayload] = cookieValue.split(".", 2);
  if (!expectedState || !encodedPayload || expectedState !== returnedState) return null;

  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as { returnTo?: unknown; frontendUrl?: unknown };
    return {
      returnTo: safeReturnTo(payload.returnTo),
      frontendUrl: safeFrontendUrl(payload.frontendUrl),
    };
  } catch {
    // Keep OAuth attempts started immediately before this deployment working.
    try {
      return {
        returnTo: safeReturnTo(Buffer.from(encodedPayload, "base64url").toString("utf8")),
        frontendUrl: safeFrontendUrl(undefined),
      };
    } catch {
      return null;
    }
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

  const responseText = await response.text();
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = responseText.slice(0, 2_000);
  }

  const body = responseBody as Partial<GitLabUser>;
  if (!response.ok || !body.id || !body.username) {
    console.error("GitLab profile request failed", {
      url: userUrl.toString(),
      status: response.status,
      statusText: response.statusText,
      body: responseBody,
    });
    throw new HttpError(502, "GITLAB_PROFILE_FAILED", "The GitLab profile could not be loaded.");
  }
  return body as GitLabUser;
}

export async function upsertGitLabUser(gitlabUser: GitLabUser) {
  const result = await pool.query<AppUser & { display_name: string; avatar_url: string | null; gitlab_profile_url: string | null }>(
    `INSERT INTO users (id, gitlab_id, username, display_name, avatar_url, gitlab_profile_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (gitlab_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url,
       gitlab_profile_url = EXCLUDED.gitlab_profile_url,
       updated_at = NOW()
     RETURNING id, username, display_name, avatar_url, gitlab_profile_url, bio, skills`,
    [
      randomUUID(),
      String(gitlabUser.id),
      gitlabUser.username,
      gitlabUser.name || gitlabUser.username,
      gitlabUser.avatar_url,
      gitlabUser.web_url,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(500, "USER_UPSERT_FAILED", "The user account could not be saved.");
  return mapUser(row);
}

export async function getUserById(id: string) {
  const result = await pool.query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    gitlab_profile_url: string | null;
    bio: string;
    skills: string[];
  }>(
    `SELECT id, username, display_name, avatar_url, gitlab_profile_url, bio, skills
     FROM users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return mapUser(row);
}
