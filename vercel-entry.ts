// Vercel Build Output API function entry for a static SPA.
//
// For a pure client-side SPA, Vercel's static file serving handles everything.
// This entry serves as the catch-all fallback: any request that doesn't match a
// static file returns index.html (SPA routing).
//
// Bundled into .vercel/output/functions/render.func/index.mjs by build-vercel.sh.
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const STATIC_DIR = join(import.meta.dirname ?? ".", "..", "..", "static");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveFile(path: string): Promise<Response | null> {
  try {
    const file = await readFile(path);
    const ext = path.slice(path.lastIndexOf("."));
    const mime = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(file, {
      headers: { "content-type": mime },
    });
  } catch {
    return null;
  }
}

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = req.url ?? "/";
    const pathname = url.split("?")[0];

    // Try to serve exact file first
    const filePath = join(STATIC_DIR, pathname === "/" ? "index.html" : pathname);
    let webRes = await serveFile(filePath);

    // SPA fallback: serve index.html
    if (!webRes) {
      webRes = await serveFile(join(STATIC_DIR, "index.html"));
    }

    if (webRes) {
      res.statusCode = webRes.status;
      webRes.headers.forEach((value, key) => res.setHeader(key, value));
      const buf = await webRes.arrayBuffer();
      res.end(Buffer.from(buf));
    } else {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain");
      res.end("Not Found");
    }
  } catch (error) {
    console.error("[firstcommit] request failed", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end("Internal Server Error");
  }
}
