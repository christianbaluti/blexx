import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const entries = [
  {
    dir: join(process.cwd(), "public"),
    source: "../apps/api/dist/vercel.js"
  },
  {
    dir: join(process.cwd(), "apps", "api", "public"),
    source: "../dist/vercel.js"
  }
];

for (const entry of entries) {
  await mkdir(entry.dir, { recursive: true });
  await writeFile(
    join(entry.dir, "server.mjs"),
    `import { handleVercelRequest } from "${entry.source}";\n\nexport default async function handler(request, response) {\n  await handleVercelRequest(request, response);\n}\n`,
    "utf8"
  );
}
