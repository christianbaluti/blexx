import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const entries = [
  {
    dir: join(process.cwd(), "public"),
    source: "../apps/api/dist/app.js"
  },
  {
    dir: join(process.cwd(), "apps", "api", "public"),
    source: "../dist/app.js"
  }
];

for (const entry of entries) {
  await mkdir(entry.dir, { recursive: true });
  await writeFile(
    join(entry.dir, "server.mjs"),
    `import Fastify from "fastify";\nimport { createApp } from "${entry.source}";\n\nFastify;\n\nconst fastify = await createApp();\nawait fastify.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });\n`,
    "utf8"
  );
}
