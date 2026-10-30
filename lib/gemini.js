// Server-only helper: one place for the Gemini call, the shared rate limit and input caps.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// A small per-instance limit (20 calls a minute) so one visitor can't drain the free Gemini quota.
const calls = [];
function allow() {
  const now = Date.now();
  while (calls.length && now - calls[0] > 60_000) calls.shift();
  if (calls.length >= 20) return false;
  calls.push(now);
  return true;
}

/** Trimmed string or "" — every field from the browser goes through this. */
export const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

/** A capped list of plain issues the browser sent: number, title, a slice of the body, labels. */
export function issueList(v, max = 100) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).map((i) => ({
    number: Number(i?.number) || 0,
    title: str(i?.title, 200),
    body: str(i?.body, 300),
    labels: Array.isArray(i?.labels) ? i.labels.slice(0, 8).map((l) => str(l, 40)) : [],
    state: str(i?.state, 10),
    closed_at: str(i?.closed_at, 30),
  }));
}

export function requireSpeech(text) {
  if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "Say (or type) something first");
  if (text.length > 12000) throw new HttpError(400, "That's too long; keep it under ~2,000 words");
  return text;
}

export async function gemini(prompt, schema) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(500, "GEMINI_API_KEY is not set on the server");
  if (prompt.length > 60000) throw new HttpError(400, "Too much at once; try a shorter note or fewer issues");
  if (!allow()) throw new HttpError(429, "Too many requests. Wait a minute and try again.");

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schema },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 429) throw new HttpError(429, "The free AI quota is busy. Wait 30 seconds and try again.");
    throw new HttpError(502, data?.error?.message || `The AI service answered ${r.status}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "The AI sent back something unreadable. Try again.");
  }
}

/** Wrap a (body) => result function as a Vercel/Node handler. */
export function handler(fn) {
  return async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      res.status(200).json(await fn(body));
    } catch (e) {
      res.status(e instanceof HttpError ? e.status : 500).json({ error: e.message });
    }
  };
}

export const SPOKEN = `The text was dictated by voice (often with Wispr Flow), so it can ramble, repeat itself, switch between
English and Hindi/Hinglish, and contain filler words. Understand it the way a teammate would.`;
