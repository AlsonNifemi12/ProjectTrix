import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  authenticatePasswordUser,
  assertGitLabConfigured,
  buildFrontendCallbackUrl,
  buildGitLabAuthorizationUrl,
  createOAuthState,
  exchangeGitLabCode,
  fetchGitLabUser,
  getUserById,
  readOAuthState,
  registerPasswordUser,
  safeFrontendUrl,
  safeReturnTo,
  upsertGitLabUser,
} from "./auth.service.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import {
  clearSessionCookie,
  oauthCookieOptions,
  sessionCookieOptions,
  setSessionCookie,
} from "./session.js";

const router = Router();
const OAUTH_COOKIE = "projecttrix_oauth_state";

router.post(
  "/register",
  asyncHandler(async (request, response) => {
    const input = registerSchema.parse(request.body);
    const user = await registerPasswordUser(input);
    setSessionCookie(response, user);
    response.status(201).json({ data: user, message: "Account created" });
  }),
);

router.post(
  "/login",
  asyncHandler(async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = await authenticatePasswordUser(input.email, input.password);
    setSessionCookie(response, user);
    response.json({ data: user, message: "Signed in" });
  }),
);

router.get("/gitlab", (request, response) => {
  assertGitLabConfigured();
  const returnTo = safeReturnTo(request.query.returnTo);
  const frontendUrl = safeFrontendUrl(request.query.frontendUrl);
  const { state, cookieValue } = createOAuthState(returnTo, frontendUrl);
  response.cookie(OAUTH_COOKIE, cookieValue, oauthCookieOptions);
  response.redirect(buildGitLabAuthorizationUrl(state));
});

router.get(
  "/gitlab/callback",
  asyncHandler(async (request, response) => {
    assertGitLabConfigured();
    const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(request.query);
    const oauthState = readOAuthState(request.cookies?.[OAUTH_COOKIE], query.state);
    if (!oauthState) {
      throw new HttpError(400, "INVALID_OAUTH_STATE", "The sign in request expired or could not be verified.");
    }

    const accessToken = await exchangeGitLabCode(query.code);
    const gitlabUser = await fetchGitLabUser(accessToken);
    const user = await upsertGitLabUser(gitlabUser);
    setSessionCookie(response, user);
    response.clearCookie(OAUTH_COOKIE, { ...sessionCookieOptions, maxAge: undefined });

    const redirect = buildFrontendCallbackUrl(oauthState.frontendUrl, oauthState.returnTo);
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
