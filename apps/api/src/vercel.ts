import { createApp } from "./app.js";

const appPromise = createApp();

type VercelRequest = {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
};

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function originalPath(request: VercelRequest) {
  const rewrittenPath =
    firstHeader(request.headers?.["x-vercel-original-path"]) ??
    firstHeader(request.headers?.["x-now-route-matches"]);

  if (rewrittenPath?.startsWith("/")) return rewrittenPath;
  return request.url;
}

export async function handleVercelRequest(request: VercelRequest, response: unknown) {
  const path = originalPath(request);
  if (path) request.url = path;
  if (request.url === "/api") request.url = "/";
  if (request.url?.startsWith("/api/")) request.url = request.url.slice(4);

  const app = await appPromise;
  await app.ready();
  app.server.emit("request", request, response);
}
