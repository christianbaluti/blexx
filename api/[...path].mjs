import { handleVercelRequest } from "../apps/api/dist/vercel.js";

export default async function handler(request, response) {
  await handleVercelRequest(request, response);
}
