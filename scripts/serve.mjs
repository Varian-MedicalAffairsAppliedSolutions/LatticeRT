#!/usr/bin/env node
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(new URL(".", import.meta.url)));
const root = resolve(__dirname, "..");

const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = resolve(root, "." + normalized);
  if (!abs.startsWith(root)) return null;
  return abs;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (!req.url) return send(res, 400, "Bad Request");
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method Not Allowed");

  let absPath = safePath(req.url);
  if (!absPath) return send(res, 403, "Forbidden");

  if (existsSync(absPath) && statSync(absPath).isDirectory()) {
    absPath = join(absPath, "index.html");
  }

  if (!existsSync(absPath) || !statSync(absPath).isFile()) {
    return send(res, 404, "Not Found");
  }

  const ext = extname(absPath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const stat = statSync(absPath);

  res.writeHead(200, {
    "content-type": mime,
    "content-length": stat.size,
    "cache-control": "no-store",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(absPath).pipe(res);
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Serving ${root}`);
  // eslint-disable-next-line no-console
  console.log(`Open: http://localhost:${port}/`);
  // eslint-disable-next-line no-console
  console.log(`LAN:  http://${host}:${port}/ (host may need firewall allow)`);
});
