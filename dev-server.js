// Local dev server: serves the static app and the /api functions, same as Vercel does in production.
// Run: node dev-server.js   (needs GEMINI_API_KEY in the environment)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "./lib/gemini.js";
import { plan } from "./api/plan.js";
import { share } from "./api/share.js";
import { standup } from "./api/standup.js";
import { callback, config, login } from "./lib/oauth.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const PORT = process.env.PORT || 5173;
const API = { "/api/plan": plan, "/api/standup": standup, "/api/share": share };
const AUTH = { "/api/auth/config": config, "/api/auth/login": login, "/api/auth/callback": callback };
// Only these files are public; everything else (server code, .env, logs) is never served.
const PUBLIC = new Set(["/index.html", "/ui.js", "/style.css", "/lib/text.js", "/lib/github.js", "/lib/log.js",
  "/lib/commands.js", "/lib/work.js", "/lib/samples.js"]);

createServer(async (req, res) => {
  const send = (status, body, type = "application/json") => {
    res.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const path = req.url.split("?")[0];
  if (AUTH[path]) return AUTH[path](req, res);
  const fn = API[path];
  if (fn) {
    if (req.method !== "POST") return send(405, { error: "POST only" });
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 500_000) return send(413, { error: "Request too large" });
    }
    try {
      return send(200, await fn(JSON.parse(raw || "{}")));
    } catch (e) {
      return send(e instanceof HttpError ? e.status : 500, { error: e.message });
    }
  }
  const file = path === "/" ? "/index.html" : path;
  if (!PUBLIC.has(file)) return send(404, "Not found", "text/plain");
  send(200, await readFile(join(ROOT, file), "utf8"), TYPES[extname(file)]);
}).listen(PORT, "127.0.0.1", () => console.log(`TalkTickets on http://localhost:${PORT}`));
