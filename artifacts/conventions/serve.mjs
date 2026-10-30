import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFrontendCsp } from "./security-policy.mjs";

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError("A valid PORT is required.");
}

const publicRoot = await realpath(fileURLToPath(new URL("./dist/public/", import.meta.url)));
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const securityHeaders = {
  "Content-Security-Policy": createFrontendCsp("'self'", true),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-cache",
};

async function fileForPath(pathname) {
  const requested = path.resolve(publicRoot, `.${pathname}`);
  if (requested !== publicRoot && !requested.startsWith(`${publicRoot}${path.sep}`)) return null;

  let resolved;
  try {
    resolved = await realpath(requested);
  } catch {
    return null;
  }
  if (resolved !== publicRoot && !resolved.startsWith(`${publicRoot}${path.sep}`)) return null;

  try {
    const metadata = await stat(resolved);
    return metadata.isFile() ? { path: resolved, metadata } : null;
  } catch {
    return null;
  }
}

async function serve(req, res) {
  for (const [name, value] of Object.entries(securityHeaders)) {
    res.setHeader(name, value);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.writeHead(405).end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  let file = await fileForPath(pathname);
  if (!file && !path.extname(pathname)) {
    file = await fileForPath("/index.html");
  }
  if (!file) {
    res.writeHead(404).end("Not found");
    return;
  }

  res.setHeader(
    "Content-Type",
    contentTypes.get(path.extname(file.path).toLowerCase()) ?? "application/octet-stream",
  );
  res.setHeader("Content-Length", String(file.metadata.size));
  res.writeHead(200);
  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = createReadStream(file.path);
  stream.on("error", () => {
    if (res.headersSent) res.destroy();
    else res.writeHead(500).end("Internal server error");
  });
  stream.pipe(res);
}

createServer((req, res) => {
  void serve(req, res).catch(() => {
    if (res.headersSent) res.destroy();
    else res.writeHead(500).end("Internal server error");
  });
}).listen(port, "0.0.0.0");
