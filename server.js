// Local dev server: serves the static app and /api/plan, same as Vercel does in production.
// Run: node server.js   (needs GEMINI_API_KEY in the environment)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { plan } from "./api/plan.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const PORT = process.env.PORT || 5173;

createServer(async (req, res) => {
  const send = (status, body, type = "application/json") => {
    res.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  if (req.url === "/api/plan") {
    if (req.method !== "POST") return send(405, { error: "POST only" });
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      return send(200, await plan(JSON.parse(raw || "{}")));
    } catch (e) {
      return send(e.status && e.status < 600 ? e.status : 500, { error: e.message });
    }
  }
  const path = normalize(req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0]);
  if (path.includes("..") || path.startsWith("\\api") || path.startsWith("/api") || path.endsWith(".env")) return send(404, "Not found", "text/plain");
  try {
    send(200, await readFile(join(ROOT, path), "utf8"), TYPES[extname(path)] || "text/plain");
  } catch {
    send(404, "Not found", "text/plain");
  }
}).listen(PORT, () => console.log(`TalkTickets on http://localhost:${PORT}`));
