// POST /api/share: write progress posts from what actually happened on the repo.
// Body: { repo, days, closed: [...issues], active: [...issues], note? (spoken: what to highlight) }
import { HttpError, gemini, handler, issueList, str } from "../lib/gemini.js";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    x_post: { type: "STRING" },
    linkedin_post: { type: "STRING" },
    changelog: { type: "STRING" },
  },
  required: ["x_post", "linkedin_post", "changelog"],
};

const RULES = `You write short progress updates for a builder, from what happened on their GitHub repo.

Rules:
- TRUTH: mention only work in the lists below. Don't invent features, numbers, users or results.
- Only CLOSED issues are finished. For open ones say "working on", "started", "found" or "blocked on" (from their
  labels). Never say fixed, addressed, shipped, resolved or added about an open issue.
- Refer to issues by their number like #12 where it helps; only numbers from the lists.
- "x_post": at most 260 characters including spaces, plain and specific, end with #NoHandsChallenge. No more than 2 hashtags.
- "linkedin_post": 60-120 words, first person, a short opening line, 2-4 bullet lines starting with "- ", a line on
  what's next (from open/blocked work), end with #NoHandsChallenge.
- "changelog": Markdown with "### Done", "### In progress" and "### Blocked" sections (skip empty ones), one bullet
  per issue: "- #N Title".
- If the person added a spoken note about what to highlight, follow it, but it can't add facts that aren't in the lists.
- Simple English, no hype words like "thrilled", "excited", "game-changer".`;

export async function share(input) {
  const closed = issueList(input?.closed, 60);
  const active = issueList(input?.active, 60);
  if (!closed.length && !active.length) throw new HttpError(400, "Nothing happened in this period yet. Close or update some issues first.");
  const days = Math.min(Math.max(Number(input?.days) || 7, 1), 30);
  const note = str(input?.note, 1500);
  const fmt = (i) => `#${i.number} ${i.title}${i.labels.length ? ` [${i.labels.join(", ")}]` : ""}`;
  const prompt = `${RULES}

PROJECT: ${str(input?.repo, 120) || "a GitHub project"}, last ${days} day(s).

CLOSED (done) in this period:
${closed.map(fmt).join("\n") || "(none)"}

STILL OPEN, touched in this period (status in brackets; "open" means only filed or discussed, no work started):
${active.map((i) => `${fmt(i)} (${i.labels.includes("blocked") ? "blocked" : i.labels.includes("in-progress") ? "in progress" : "open"})`).join("\n") || "(none)"}
${note ? `\nWhat the person wants to highlight (spoken):\n"""\n${note}\n"""\n` : ""}
Return JSON only.`;
  const out = await gemini(prompt, SCHEMA);
  return { x_post: str(out.x_post, 600), linkedin_post: str(out.linkedin_post, 3000), changelog: str(out.changelog, 6000) };
}

export default handler(share);
