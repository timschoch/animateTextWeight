// Ephemeral static server for browser tests, serving the repo root. Reused by
// every test/*.browser.test.mjs file, and by scripts/compare.mjs's pattern.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

/** Start a server on an ephemeral port. Returns its base URL and a close(). */
export async function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const path = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
      const body = await readFile(path);
      res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return { url: `http://localhost:${port}`, close: () => server.close() };
}
