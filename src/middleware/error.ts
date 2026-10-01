import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

import { HttpError } from "../utils/http-error.js";

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new HttpError(404, "ROUTE_NOT_FOUND", `No route matches ${request.method} ${request.path}.`));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "request";
      if (!fields[key]) fields[key] = issue.message;
    }

    response.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please correct the highlighted fields.",
        fields,
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    });
    return;
  }

  const databaseCode = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;

  if (databaseCode === "23505") {
    response.status(409).json({
      error: {
        code: "RESOURCE_ALREADY_EXISTS",
        message: "This record already exists.",
      },
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "The server could not complete the request.",
    },
  });
};
