import { createApp } from "./app.js";

const appPromise = createApp();

export async function handleVercelRequest(request: { url?: string }, response: unknown) {
  if (request.url === "/api") request.url = "/";
  if (request.url?.startsWith("/api/")) request.url = request.url.slice(4);

  const app = await appPromise;
  await app.ready();
  app.server.emit("request", request, response);
}
