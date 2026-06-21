import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { config } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCommerceRoutes } from "./routes/commerce.js";
import { registerModuleRoutes } from "./routes/modules.js";

export async function createApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 2 * 1024 * 1024
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(jwt, { secret: config.jwtSecret });

  app.get("/health", async () => ({ ok: true, service: "blex-api" }));

  await registerAuthRoutes(app);
  await registerCommerceRoutes(app);
  await registerModuleRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const handled = error as Error & { statusCode?: number };
    const statusCode = handled.statusCode ?? 500;
    reply.status(statusCode).send({
      error: handled.name,
      message: statusCode === 500 ? "Internal server error" : handled.message
    });
  });

  return app;
}
