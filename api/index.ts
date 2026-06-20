import { handleVercelRequest } from "../apps/api/src/vercel.js";

export default async function handler(request: { url?: string }, response: unknown) {
  await handleVercelRequest(request, response);
}
