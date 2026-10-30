// "Sign in with GitHub" (OAuth web flow). Server-only. Enabled when GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set.
// Written against plain Node req/res so it runs the same on Vercel and in server.js.
import { randomBytes, timingSafeEqual } from "node:crypto";

const id = () => process.env.GITHUB_CLIENT_ID || "";
const secret = () => process.env.GITHUB_CLIENT_SECRET || "";
export const enabled = () => Boolean(id() && secret());

const cookie = (req, name) =>
  (req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1] || "";

function origin(req) {
  const proto = req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http");
  return `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

function reply(res, status, headers, body = "") {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

export function config(req, res) {
  reply(res, 200, { "Content-Type": "application/json", "Cache-Control": "no-store" }, JSON.stringify({ enabled: enabled() }));
}

export function login(req, res) {
  if (!enabled()) return reply(res, 404, { "Content-Type": "text/plain" }, "GitHub sign-in isn't set up on this server.");
  const state = randomBytes(16).toString("hex");
  const secure = origin(req).startsWith("https") ? "; Secure" : "";
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", id());
  url.searchParams.set("redirect_uri", `${origin(req)}/api/auth/callback`);
  url.searchParams.set("scope", "public_repo");
  url.searchParams.set("state", state);
  reply(res, 302, {
    Location: url.toString(),
    "Set-Cookie": `tt_state=${state}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
    "Cache-Control": "no-store",
  });
}

export async function callback(req, res) {
  const page = (script) => reply(res, 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Set-Cookie": "tt_state=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'",
    "Referrer-Policy": "no-referrer",
  }, `<!doctype html><meta charset="utf-8"><title>Signing in…</title><script>${script}</script>`);
  const fail = (why) => page(`sessionStorage.setItem("tt-oauth-error", ${JSON.stringify(why)}); location.replace("/");`);

  if (!enabled()) return fail("GitHub sign-in isn't set up on this server.");
  const q = new URL(req.url, "http://x").searchParams;
  const state = q.get("state") || "";
  const saved = cookie(req, "tt_state");
  if (!state || !saved || state.length !== saved.length || !timingSafeEqual(Buffer.from(state), Buffer.from(saved)))
    return fail("Sign-in expired or was tampered with. Try again.");
  if (!q.get("code")) return fail(q.get("error_description") || "GitHub didn't sign you in.");

  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id(), client_secret: secret(), code: q.get("code"), redirect_uri: `${origin(req)}/api/auth/callback` }),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.access_token) return fail(data.error_description || "GitHub didn't return a token.");
  // The token goes to this tab's sessionStorage only; the app moves it into memory and removes it.
  page(`sessionStorage.setItem("tt-oauth", ${JSON.stringify(data.access_token)}); location.replace("/");`);
}
