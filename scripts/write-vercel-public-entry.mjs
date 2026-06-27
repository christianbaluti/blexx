import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const entries = [
  {
    dir: join(process.cwd(), "api"),
    filename: "index.mjs",
    contents: `import { handleVercelRequest } from "../apps/api/dist/vercel.js";\n\nexport default handleVercelRequest;\n`
  },
  {
    dir: join(process.cwd(), "public"),
    filename: "server.mjs",
    contents: `import Fastify from "fastify";\nimport { createApp } from "../apps/api/dist/app.js";\n\nFastify;\n\nconst fastify = await createApp();\nfastify.listen({ port: Number(process.env.PORT ?? 3000) });\n`
  },
  {
    dir: join(process.cwd(), "apps", "api", "public"),
    filename: "server.mjs",
    contents: `import Fastify from "fastify";\nimport { createApp } from "../dist/app.js";\n\nFastify;\n\nconst fastify = await createApp();\nfastify.listen({ port: Number(process.env.PORT ?? 3000) });\n`
  }
];

for (const entry of entries) {
  await mkdir(entry.dir, { recursive: true });
  await writeFile(join(entry.dir, entry.filename), entry.contents, "utf8");
}
