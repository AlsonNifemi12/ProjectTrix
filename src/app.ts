import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { checkDatabase } from "./config/database.js";
import { corsOrigins, env } from "./config/env.js";
import { attachUser } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { metadataRouter } from "./modules/metadata/metadata.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { asyncHandler } from "./utils/async-handler.js";
import { HttpError } from "./utils/http-error.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new HttpError(403, "ORIGIN_NOT_ALLOWED", "This frontend origin is not allowed."));
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.NODE_ENV === "test" ? 10_000 : 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(attachUser);

  app.get("/", (_request, response) => {
    response.json({
      data: {
        name: "ProjectTrix API",
        version: "0.1.0",
        documentation: "/docs/openapi.yaml",
      },
    });
  });

  app.get("/api/v1/health", (_request, response) => {
    response.json({ data: { status: "ok", timestamp: new Date().toISOString() } });
  });

  app.get(
    "/api/v1/ready",
    asyncHandler(async (_request, response) => {
      const databaseTime = await checkDatabase();
      response.json({ data: { status: "ready", databaseTime } });
    }),
  );

  app.use("/docs", express.static("docs"));
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/projects", projectsRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/metadata", metadataRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
