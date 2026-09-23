// Renders demo/compare.html to demo/compare.png, the picture at the top of the README.
// Needs a build first (the page imports dist/) and an installed Chrome.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

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

const browser = await puppeteer.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 600, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${server.address().port}/demo/compare.html`);
  await page.waitForSelector("html[data-ready]");
  const compare = await page.$("#compare");
  await compare.screenshot({ path: join(root, "demo/compare.png") });
  console.log("wrote demo/compare.png");
} finally {
  await browser.close();
  server.close();
}
