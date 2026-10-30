// Pure text helpers, shared by the browser app and the tests.

// Spoken filler: English plus common Hindi/Hinglish ones. Kept conservative so real words survive.
const FILLER = /\b(?:u+m+|u+h+|e+r+m*|hmm+|you know|i mean|basically|kind of|sort of|okay so|ok so|matlab|haan+|achha)\b/gi;

/** Split dictated text into parts, marking filler words and immediate word repeats ("the the"). */
export function markSpeech(text) {
  const parts = [];
  let fillers = 0;
  let repeats = 0;
  let last = 0;
  const re = new RegExp(`${FILLER.source}|\\b(\\w+)(\\s+\\1\\b)+`, "gi");
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    if (m[1]) {
      // keep the first copy of a repeated word, mark the rest
      parts.push({ text: m[1] });
      parts.push({ text: m[0].slice(m[1].length), kind: "repeat" });
      repeats++;
    } else {
      parts.push({ text: m[0], kind: "filler" });
      fillers++;
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return { parts, fillers, repeats };
}

export function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The truth guard: is the ticket's quote really something the person said?
 * At least 3 words; an exact match after normalising, or 80% of the quote's words found in order in the source.
 */
export function quoteFound(quote, source) {
  const q = normalize(quote);
  const s = normalize(source);
  const words = q.split(" ");
  if (!q || words.length < 3) return false; // one or two words prove nothing
  if (` ${s} `.includes(` ${q} `)) return true;
  const src = s.split(" ");
  let i = 0;
  let hits = 0;
  for (const w of words) {
    const j = src.indexOf(w, i);
    if (j !== -1) {
      hits++;
      i = j + 1;
    }
  }
  return hits / words.length >= 0.8;
}

/** The issue body we post to GitHub. */
export function issueBody(t) {
  const lines = [t.body.trim(), "", `**Done when:** ${t.done_when}`];
  if (t.due) lines.push(`**Due:** ${t.due}`);
  lines.push(`**Priority:** ${t.priority}`, "", `> From the voice note: "${t.quote}"`, "",
    "_Created with TalkTickets from a spoken plan._");
  return lines.join("\n");
}

export const wordCount = (s) => (s.match(/\S+/g) || []).length;

/**
 * Rough minutes saved by speaking instead of typing, at ~40 wpm typing and ~150 wpm speaking.
 * Shown as an estimate, never as a measurement.
 */
export const minutesSaved = (words) => Math.max(0, words / 40 - words / 150);

/** Issue numbers a post mentions, like #12. */
export const issueRefs = (text) => [...new Set([...(text || "").matchAll(/#(\d+)\b/g)].map((m) => Number(m[1])))];

/** Numbers a post mentions that weren't in the data it was written from. */
export const unknownRefs = (text, known) => issueRefs(text).filter((n) => !known.includes(n));

/**
 * Checks for one standup action: is the quote really from the standup, and does it point at a real open issue?
 * "done" with a weak match is never ticked by default.
 */
export function checkAction(a, openNumbers, source) {
  const verified = quoteFound(a.quote, source);
  const knownIssue = a.type === "new" ? true : openNumbers.includes(a.issue);
  // A link or @mention you didn't say may have been planted in an issue body: show it, never pre-tick it.
  const found = (re) => [...`${a.note || ""} ${a.title || ""}`.matchAll(re)].map((m) => m[0]);
  const risky = [...found(/https?:\/\/\S+/gi), ...found(/@[\w-]+/g)].some((x) => !source.toLowerCase().includes(x.toLowerCase()));
  const tick = verified && knownIssue && !risky && !(a.type === "done" && a.confidence === "low");
  return { verified, knownIssue, risky, tick };
}

/** The comment text each standup action posts. */
export function actionComment(a) {
  const head = { done: "Done", progress: "Progress", blocked: "Blocked", started: "Started" }[a.type] || "Update";
  return `**${head}:** ${a.note.trim()}\n\n> From the standup: "${a.quote}"\n\n_Posted with TalkTickets from a spoken standup._`;
}

/** "owner/repo" from either that or a github.com URL. */
export function parseRepo(input) {
  const m = (input || "").trim().replace(/\.git$/, "").match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+)\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}
