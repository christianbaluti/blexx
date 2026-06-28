import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function removeNonRuntimeFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await removeNonRuntimeFiles(path);
        return;
      }
      if (
        entry.name.endsWith(".d.ts") ||
        entry.name.endsWith(".test.js") ||
        entry.name === "server.js" ||
        entry.name === "db-migrate.js" ||
        entry.name === "setup-db.js"
      ) {
        await rm(path, { force: true });
      }
    })
  );
}

const apiDist = join(process.cwd(), "api", "dist");
await rm(apiDist, { recursive: true, force: true });
await mkdir(apiDist, { recursive: true });
await cp(join(process.cwd(), "apps", "api", "dist"), apiDist, { recursive: true });
await removeNonRuntimeFiles(apiDist);

const entries = [
  {
    dir: join(process.cwd(), "api"),
    filename: "index.mjs",
    contents: `import { handleVercelRequest } from "./dist/vercel.js";\n\nexport default handleVercelRequest;\n`
  },
  {
    dir: join(process.cwd(), "api"),
    filename: "package.json",
    contents: `{"type":"module"}\n`
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
