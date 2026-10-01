import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env, isProduction } from "../../config/env.js";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  sub: string;
  username: string;
};

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction || env.COOKIE_SAME_SITE === "none",
  sameSite: env.COOKIE_SAME_SITE,
  path: "/",
  maxAge: SESSION_DURATION_SECONDS * 1000,
};

export const oauthCookieOptions: CookieOptions = {
  ...sessionCookieOptions,
  maxAge: 10 * 60 * 1000,
};

export function createSessionToken(user: { id: string; username: string }) {
  return jwt.sign(
    { username: user.username },
    env.JWT_SECRET,
    { subject: user.id, expiresIn: SESSION_DURATION_SECONDS },
  );
}

export function verifySessionToken(token: string): SessionPayload {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (typeof payload === "string" || !payload.sub || typeof payload.username !== "string") {
    throw new Error("Invalid session payload");
  }

  return { sub: payload.sub, username: payload.username };
}

export function setSessionCookie(response: Response, user: { id: string; username: string }) {
  response.cookie(env.SESSION_COOKIE_NAME, createSessionToken(user), sessionCookieOptions);
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(env.SESSION_COOKIE_NAME, {
    ...sessionCookieOptions,
    maxAge: undefined,
  });
}

export function readSession(request: Request) {
  const token = request.cookies?.[env.SESSION_COOKIE_NAME];
  if (typeof token !== "string" || !token) return null;

  try {
    return verifySessionToken(token);
  } catch {
    return null;
  }
}
