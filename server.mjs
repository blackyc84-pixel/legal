import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./lib/store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
      const error = new Error("요청이 너무 큽니다.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("JSON 형식이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(payload);
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.normalize(path.join(publicDir, rel));
  if (!file.startsWith(publicDir)) {
    send(res, 403, { error: "접근할 수 없습니다." });
    return;
  }
  try {
    const data = await readFile(file);
    send(res, 200, data, types[path.extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, { error: "파일을 찾을 수 없습니다." });
  }
}

export async function handle(req, res) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const { pathname } = url;
    const method = req.method || "GET";

    if (pathname === "/api/state" && method === "GET") {
      send(res, 200, { ...(await store.getState()), options: store.OPTIONS });
      return;
    }
    if (pathname === "/api/projects" && method === "POST") {
      send(res, 201, await store.createProject(await readJson(req)));
      return;
    }
    if (pathname === "/api/cases" && method === "POST") {
      send(res, 201, await store.createCase(await readJson(req)));
      return;
    }

    let match = pathname.match(/^\/api\/cases\/([^/]+)$/);
    if (match && method === "PATCH") {
      send(res, 200, await store.updateCase(decodeURIComponent(match[1]), await readJson(req)));
      return;
    }
    match = pathname.match(/^\/api\/cases\/([^/]+)\/review$/);
    if (match && method === "PUT") {
      send(res, 200, await store.saveReview(decodeURIComponent(match[1]), await readJson(req)));
      return;
    }
    match = pathname.match(/^\/api\/cases\/([^/]+)\/responses$/);
    if (match && method === "POST") {
      send(res, 201, await store.addResponse(decodeURIComponent(match[1]), await readJson(req)));
      return;
    }
    match = pathname.match(/^\/api\/cases\/([^/]+)\/hearings$/);
    if (match && method === "POST") {
      send(res, 201, await store.addHearing(decodeURIComponent(match[1]), await readJson(req)));
      return;
    }
    match = pathname.match(/^\/api\/responses\/([^/]+)$/);
    if (match && method === "PATCH") {
      send(res, 200, await store.updateResponse(decodeURIComponent(match[1]), await readJson(req)));
      return;
    }
    match = pathname.match(/^\/api\/hearings\/([^/]+)$/);
    if (match && method === "PATCH") {
      send(res, 200, await store.updateHearing(decodeURIComponent(match[1]), await readJson(req)));
      return;
    }

    if (pathname.startsWith("/api/")) {
      send(res, 404, { error: "요청을 찾을 수 없습니다." });
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      send(res, 405, { error: "허용되지 않은 요청입니다." });
      return;
    }
    await serveStatic(res, pathname);
  } catch (error) {
    send(res, error.status || 500, { error: error.status ? error.message : "저장에 실패했습니다." });
  }
}

export function start(listenPort = port, listenHost = host) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      send(res, 500, { error: "저장에 실패했습니다." });
      console.error(error);
    });
  });
  return new Promise((resolve) => {
    server.listen(listenPort, listenHost, () => resolve(server));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().then((server) => {
    const address = server.address();
    console.log(`분쟁 검토 도구 http://${host}:${address.port}`);
  });
}
