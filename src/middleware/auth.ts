import type { RequestHandler } from "express";

import { readSession } from "../modules/auth/session.js";
import { HttpError } from "../utils/http-error.js";

export const attachUser: RequestHandler = (request, _response, next) => {
  const session = readSession(request);
  if (session) {
    request.user = { id: session.sub, username: session.username };
  }
  next();
};

export const requireAuth: RequestHandler = (request, _response, next) => {
  if (!request.user) {
    next(new HttpError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue."));
    return;
  }
  next();
};
