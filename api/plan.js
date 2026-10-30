// POST /api/plan: turn a spoken plan into GitHub-ready tickets with Gemini.
// Body: { transcript, answers?, tickets?, instruction?, existing?: [{number, title}] }
// - First pass: transcript (+ existing issue titles for duplicate checks).
// - Refine pass: also send the current tickets plus answers to questions or a spoken change request.

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    tickets: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          body: { type: "STRING" },
          done_when: { type: "STRING" },
          labels: { type: "ARRAY", items: { type: "STRING" } },
          priority: { type: "STRING", enum: ["P1", "P2", "P3"] },
          due: { type: "STRING" },
          quote: { type: "STRING" },
          questions: { type: "ARRAY", items: { type: "STRING" } },
          duplicate_of: { type: "INTEGER" },
        },
        required: ["title", "body", "done_when", "labels", "priority", "due", "quote", "questions"],
      },
    },
  },
  required: ["tickets"],
};

const RULES = `You turn a person's spoken plan into GitHub issues. The text was dictated by voice (often with Wispr Flow),
so it can ramble, repeat itself, switch between English and Hindi/Hinglish, and contain filler words.

Rules:
- One ticket per separate piece of work. Merge repeats of the same task. Skip pure chit-chat.
- Write titles and bodies in clear, short English, starting titles with a verb ("Add…", "Fix…", "Record…").
- TRUTH: use only what the person said (and their answers). Never invent tools, numbers, names, dates or steps.
- "quote": copy a short phrase (4-12 words) EXACTLY as it appears in the transcript or answers that this ticket comes from.
  Do not translate or fix it. It is used to verify the ticket.
- "due": only if the person said a date or deadline that applies to this task; otherwise "". Write it the way they
  said it, translated to English ("November 7, night", "Friday", "kal tak" → "by tomorrow"). Never add a year, weekday or time they didn't say.
- "done_when": one line describing how we know it's finished, based on what they said. If they didn't make it clear,
  write your best plain reading of their words AND add a question.
- "questions": ask about anything missing that you would otherwise have to guess (what exactly, how big, by when).
  Ask at most 2 per ticket, in simple English. Empty if the ticket is clear.
- "labels": 1-2 short lowercase labels from what the task is about (e.g. "docs", "bug", "demo", "setup").
- "priority": P1 if they said it's first/urgent/blocking, P3 if "later/maybe/nice to have", else P2.
- "duplicate_of": if an EXISTING issue (given below) is clearly the same task, its number; otherwise omit it.`;

function buildPrompt({ transcript, answers, tickets, instruction, existing }) {
  let p = `${RULES}\n\nTRANSCRIPT (spoken plan):\n"""\n${transcript}\n"""\n`;
  if (answers) p += `\nANSWERS the person gave to your earlier questions (also spoken):\n"""\n${answers}\n"""\n`;
  if (existing?.length)
    p += `\nEXISTING open issues in the repo:\n${existing.map((i) => `#${i.number} ${i.title}`).join("\n")}\n`;
  if (tickets?.length) {
    p += `\nCURRENT tickets (JSON):\n${JSON.stringify(tickets)}\n`;
    p += instruction
      ? `\nThe person asked for this change (spoken): "${instruction}"\nApply it. Keep every other ticket as it is.\n`
      : `\nUpdate the current tickets using the answers. Drop questions that are now answered.\n`;
  }
  return p + "\nReturn JSON only.";
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

export async function plan(input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("GEMINI_API_KEY is not set on the server"), { status: 500 });
  if (typeof input?.transcript !== "string" || !input.transcript.trim())
    throw Object.assign(new Error("Say (or type) your plan first"), { status: 400 });
  if (input.transcript.length > 12000) throw Object.assign(new Error("That's too long; keep it under ~2,000 words"), { status: 400 });
  // Cap every field so the endpoint can't be used to push huge prompts through the shared API key.
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  input = {
    transcript: input.transcript,
    answers: str(input.answers, 4000),
    instruction: str(input.instruction, 500),
    tickets: Array.isArray(input.tickets) ? input.tickets.slice(0, 25) : [],
    existing: Array.isArray(input.existing)
      ? input.existing.slice(0, 100).map((i) => ({ number: Number(i?.number) || 0, title: str(i?.title, 200) }))
      : [],
  };
  if (JSON.stringify(input.tickets).length > 20000) throw Object.assign(new Error("Too many tickets at once"), { status: 400 });
  if (!allow()) throw Object.assign(new Error("Too many requests. Wait a minute and try again."), { status: 429 });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: SCHEMA },
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error?.message || `Gemini error ${r.status}`;
    throw Object.assign(new Error(r.status === 429 ? "The free AI quota is busy. Wait 30 seconds and try again." : msg),
      { status: r.status });
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";
  const out = JSON.parse(text);
  return { tickets: Array.isArray(out.tickets) ? out.tickets : [] };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    res.status(200).json(await plan(body));
  } catch (e) {
    res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.message });
  }
}
