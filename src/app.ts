// Builds the Express application. Kept separate from server.ts so tests can
// create an app without opening a network port.
//
// Request pipeline (top to bottom):
//   security headers -> CORS -> body/cookie parsing -> rate limit
//   -> load session -> CSRF check -> routes -> 404 -> error handler
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { loadSession } from "./middleware/auth.middleware";
import { csrfProtection } from "./middleware/csrf.middleware";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { createApiLimiters } from "./middleware/rate-limit.middleware";
import { createApiRouter } from "./routes";

export interface AppOptions {
  /** Override the login rate limit (used by tests). */
  loginRateLimit?: number;
}

export function createApp(options: AppOptions = {}) {
  const app = express();

  // Render (and most hosts) sit behind a proxy; this makes req.ip the real client IP.
  app.set("trust proxy", env.trustProxy);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin / server-to-server requests (no Origin header) and listed frontends.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true, // allow the session cookie
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Chat-CSRF-Token"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  // Health check for Render / uptime monitors (no auth, no rate limit).
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", ...createApiLimiters(), loadSession, csrfProtection, createApiRouter(options));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
