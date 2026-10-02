import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  assertGitLabConfigured,
  buildFrontendCallbackUrl,
  buildGitLabAuthorizationUrl,
  createOAuthState,
  exchangeGitLabCode,
  fetchGitLabUser,
  getUserById,
  readOAuthState,
  safeReturnTo,
  upsertGitLabUser,
} from "./auth.service.js";
import {
  clearSessionCookie,
  oauthCookieOptions,
  sessionCookieOptions,
  setSessionCookie,
} from "./session.js";

const router = Router();
const OAUTH_COOKIE = "projecttrix_oauth_state";

router.get("/gitlab", (request, response) => {
  assertGitLabConfigured();
  const returnTo = safeReturnTo(request.query.returnTo);
  const { state, cookieValue } = createOAuthState(returnTo);
  response.cookie(OAUTH_COOKIE, cookieValue, oauthCookieOptions);
  response.redirect(buildGitLabAuthorizationUrl(state));
});

router.get(
  "/gitlab/callback",
  asyncHandler(async (request, response) => {
    assertGitLabConfigured();
    const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(request.query);
    const returnTo = readOAuthState(request.cookies?.[OAUTH_COOKIE], query.state);
    if (!returnTo) {
      throw new HttpError(400, "INVALID_OAUTH_STATE", "The sign in request expired or could not be verified.");
    }

    const accessToken = await exchangeGitLabCode(query.code);
    const gitlabUser = await fetchGitLabUser(accessToken);
    const user = await upsertGitLabUser(gitlabUser);
    setSessionCookie(response, user);
    response.clearCookie(OAUTH_COOKIE, { ...sessionCookieOptions, maxAge: undefined });

    const redirect = buildFrontendCallbackUrl(env.FRONTEND_URL, returnTo);
    response.redirect(redirect.toString());
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = await getUserById(request.user!.id);
    if (!user) {
      throw new HttpError(401, "SESSION_USER_NOT_FOUND", "The session is no longer valid.");
    }
    response.json({ data: user });
  }),
);

router.post("/logout", (_request, response) => {
  clearSessionCookie(response);
  response.json({ data: null, message: "Signed out" });
});

export const authRouter = router;
