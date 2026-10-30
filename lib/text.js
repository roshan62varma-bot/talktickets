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

/** "owner/repo" from either that or a github.com URL. */
export function parseRepo(input) {
  const m = (input || "").trim().replace(/\.git$/, "").match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+)\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}
