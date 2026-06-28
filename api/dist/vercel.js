import { createApp } from "./app.js";
const appPromise = createApp();
function firstHeader(value) {
    return Array.isArray(value) ? value[0] : value;
}
function originalPath(request) {
    const rewrittenPath = firstHeader(request.headers?.["x-vercel-original-path"]) ??
        firstHeader(request.headers?.["x-now-route-matches"]);
    if (rewrittenPath?.startsWith("/"))
        return rewrittenPath;
    return request.url;
}
export async function handleVercelRequest(request, response) {
    const path = originalPath(request);
    if (path)
        request.url = path;
    if (request.url === "/api")
        request.url = "/";
    if (request.url?.startsWith("/api/"))
        request.url = request.url.slice(4);
    const app = await appPromise;
    await app.ready();
    app.server.emit("request", request, response);
}
