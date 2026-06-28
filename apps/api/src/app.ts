import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { config } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCoreRoutes } from "./routes/core.js";

export async function createApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 8 * 1024 * 1024
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(jwt, { secret: config.jwtSecret });

  app.get("/", async () => ({ ok: true, service: "blex-api" }));
  app.get("/health", async () => ({ ok: true, service: "blex-api" }));

  await registerAuthRoutes(app);
  await registerCoreRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const handled = error as Error & { code?: string; statusCode?: number };
    if (handled.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      reply.status(413).send({
        error: handled.code,
        message: "The attached file is too large. Please choose a file up to 5 MB."
      });
      return;
    }
    if (handled.name === "ZodError") {
      reply.status(400).send({
        error: handled.name,
        message: handled.message.includes("5 MB") ? "The attached file is too large. Please choose a file up to 5 MB." : "Please check the form fields and try again."
      });
      return;
    }
    const statusCode = handled.statusCode ?? 500;
    reply.status(statusCode).send({
      error: handled.name,
      message: statusCode === 500 ? "Internal server error" : handled.message
    });
  });

  return app;
}
