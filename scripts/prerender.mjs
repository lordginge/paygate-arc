// Prerender every page route to static HTML after `vite build`.
//
// The app stays a client-side SPA; this step captures each route's rendered
// DOM in a real browser and writes it as dist/public/<route>.html, which
// Cloudflare's assets binding serves for the matching path. Crawlers and
// first paint get full HTML (titles, descriptions, canonicals, schema,
// copy); React then mounts over it client-side (see src/main.tsx).
//
// API calls are aborted in the capture browser so the snapshot matches the
// client's initial render (loading states), which keeps the mount swap
// pixel-identical. Dynamic data fills in after mount exactly as before.
//
// If playwright-core or a Chromium binary is unavailable (e.g. CI), the
// script warns and exits 0: the build still works as a plain SPA.

import { createServer } from "node:http";
import { readFile, mkdir, open } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// The /mnt mount can lose large async writes if the process exits before
// the FUSE daemon flushes. Write + fsync explicitly so captures survive.
async function writeSync(path, data) {
  const fh = await open(path, "w");
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

const ROOT = normalize(join(fileURLToPath(import.meta.url), "../.."));
const OUT = join(ROOT, "dist/public");
const ORIGIN = "http://127.0.0.1:4871";

const ROUTES = [
  "/",
  "/sell",
  "/docs",
  "/fund",
  "/verify",
  "/status",
  "/dashboard",
  "/legal",
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};

function serve(spaShell) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
      if (p === "/") p = "/index.html";
      let file = join(OUT, p);
      let body;
      if (!existsSync(file) && !extname(p)) {
        // SPA fallback: always the pristine shell, never an already
        // captured page, so each route renders from a clean start.
        body = spaShell;
        file = "index.html";
      } else {
        body = await readFile(file);
      }
      res.writeHead(200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) =>
    server.listen(4871, "127.0.0.1", () => resolve(server)),
  );
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.warn("[prerender] playwright-core not installed; skipping (SPA build)");
    return;
  }
  const executablePath = ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
    existsSync,
  );
  if (!executablePath) {
    console.warn("[prerender] no chromium binary found; skipping (SPA build)");
    return;
  }

  const spaShell = await readFile(join(OUT, "index.html"));
  const server = await serve(spaShell);
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    // Keep dynamic queries in their initial loading state so the snapshot
    // matches what the client renders before data arrives. The deferred
    // background-animation chunk is blocked for the same reason: it must
    // fade in after mount, not be baked into the snapshot.
    await page.route("**/api/**", (route) => route.abort());
    await page.route("**/assets/Fibres-*.js", (route) => route.abort());

    for (const route of [...ROUTES, "/__not_found__"]) {
      await page.goto(ORIGIN + route, {
        waitUntil: "networkidle",
        timeout: 45_000,
      });
      // Let React finish first paint and head effects.
      await page.waitForTimeout(1200);
      let html = await page.content();
      if (!html.startsWith("<!doctype html>")) html = "<!doctype html>\n" + html;
      if (route === "/__not_found__") {
        await writeSync(join(OUT, "404.html"), html);
        continue;
      }
      const target =
        route === "/" ? join(OUT, "index.html") : join(OUT, `${route}.html`);
      await mkdir(join(target, ".."), { recursive: true });
      await writeSync(target, html);
      console.log(`[prerender] ${route} -> ${target}`);
    }

    const realErrors = errors.filter(
      (e) => !e.includes("AbortError") && !e.includes("Failed to fetch"),
    );
    if (realErrors.length > 0) {
      console.error("[prerender] page errors during capture:");
      for (const e of realErrors) console.error("  " + e);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error("[prerender] failed:", e);
  process.exitCode = 1;
});
