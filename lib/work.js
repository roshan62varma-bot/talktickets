// Pure helpers for the standup loop: checklists, commit evidence, nudges and the progress card. Unit-tested.
import { normalize } from "./text.js";

// ---------- checklists (GitHub task lists inside the issue body) ----------
const STEP = /^(\s*[-*] \[)( |x|X)(\] )(.+)$/;

export function parseSteps(body) {
  return (body || "").split(/\r?\n/).map((l) => l.match(STEP)).filter(Boolean).map((m) => ({ text: m[4].trim(), done: m[2] !== " " }));
}

const words = (s) => normalize(s).split(" ").filter((w) => w.length > 2);
/** Does a spoken step name match a checklist line? Same words for most of the shorter one. */
export function sameStep(a, b) {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.filter((w) => long.includes(w)).length / short.length >= 0.6;
}

/** Tick the named steps in a body. Returns the new body and which lines were ticked. */
export function tickSteps(body, names) {
  const ticked = [];
  const out = (body || "").split(/(\r?\n)/).map((line) => {
    const m = line.match(STEP);
    if (!m || m[2] !== " " || !names.some((n) => sameStep(n, m[4]))) return line;
    ticked.push(m[4].trim());
    return `${m[1]}x${m[3]}${m[4]}`;
  });
  return { body: out.join(""), ticked };
}

// ---------- multi-repo standup ----------
export const LETTERS = "ABCD";
/** "A#3" for issue 3 in the first repo. */
export const refOf = (repos, repo, number) => `${LETTERS[repos.indexOf(repo)]}#${number}`;

/** What the browser sends to /api/standup: refs instead of bare numbers so several repos can share one standup. */
export function standupPayload(repos, open, commits) {
  return {
    repos,
    issues: open.map((i) => ({
      ref: refOf(repos, i.repo, i.number), title: i.title, body: (i.body || "").replace(/^\s*[-*] \[[ xX]\] .*$/gm, "").trim(),
      labels: i.labels, steps: parseSteps(i.body).filter((s) => !s.done).map((s) => s.text),
    })),
    commits: commits.map((c) => ({ sha: c.sha, message: c.message, repo: LETTERS[repos.indexOf(c.repo)] })),
  };
}

// ---------- commit evidence ----------
/** Commits whose message mentions the issue number (#12, "fixes #12"), plus the ones the AI picked that really exist. */
export function evidenceFor(action, commits, number) {
  const picked = new Set((action.evidence || []).map((s) => String(s).toLowerCase().slice(0, 7)));
  return commits.filter((c) =>
    picked.has(c.sha.toLowerCase().slice(0, 7)) || (number && new RegExp(`#${number}\\b`).test(c.message)));
}

// ---------- nudges: what to talk about before you start ----------
const DAY = 864e5;
const age = (iso, now) => Math.floor((now - Date.parse(iso)) / DAY);

/**
 * open: [{ref, title, labels, updated_at}], log: voice log entries (newest first), now: ms.
 * Returns up to 5 [{ref, text}].
 */
export function nudges(open, log, now = Date.now()) {
  const out = [];
  const seen = new Set();
  const add = (ref, text) => { if (!seen.has(ref)) { seen.add(ref); out.push({ ref, text }); } };
  const byRef = new Map(open.map((i) => [i.ref, i]));

  const last = log.find((e) => e.mode === "standup" && Array.isArray(e.actions));
  for (const a of last?.actions || []) {
    const i = byRef.get(a.ref);
    if (i && a.type === "started") add(i.ref, `Last standup you started ${i.ref} ${i.title}. How did it go?`);
    if (i && a.type === "progress") add(i.ref, `${i.ref} ${i.title} was half way last time. Any further?`);
  }
  for (const i of open) {
    const d = age(i.updated_at, now);
    if (i.labels.includes("blocked") && d >= 1) add(i.ref, `${i.ref} ${i.title} has been blocked for ${d} day${d === 1 ? "" : "s"}. Still stuck?`);
    else if (i.labels.includes("in-progress") && d >= 3) add(i.ref, `${i.ref} ${i.title} is in progress but untouched for ${d} days.`);
  }
  return out.slice(0, 5);
}

// ---------- progress card (SVG) ----------
const x = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A 1200×630 card: counts plus up to four closed items. Same palette as the app. */
export function progressCard({ project, days, closed, active }) {
  const blocked = active.filter((i) => i.labels.includes("blocked")).length;
  const moving = active.length - blocked;
  const period = days === 1 ? "today" : days === 7 ? "this week" : `last ${days} days`;
  const stat = (n, label, color, i) =>
    `<g transform="translate(${80 + i * 260} 250)"><text font-size="96" font-weight="800" fill="${color}">${n}</text><text y="46" font-size="26" fill="#4a5470">${label}</text></g>`;
  const items = closed.slice(0, 4).map((c, i) =>
    `<text x="80" y="${430 + i * 40}" font-size="26" fill="#18213b">✓ #${c.number} ${x(cut(c.title, 60))}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Bricolage Grotesque, Segoe UI, sans-serif">
<rect width="1200" height="630" fill="#e8edf5"/>
<rect x="40" y="40" width="1120" height="550" rx="24" fill="#fbfcfe"/>
<text x="80" y="120" font-size="44" font-weight="800" fill="#18213b">${x(cut(project, 40))}</text>
<text x="80" y="164" font-size="28" fill="#4a5470">Progress ${period}, from voice standups</text>
${stat(closed.length, "done", "#1d7a52", 0)}${stat(moving, "moving", "#2f55e8", 1)}${stat(blocked, "blocked", "#c2372b", 2)}
${items}
<text x="1120" y="560" font-size="22" text-anchor="end" fill="#4a5470">TalkTickets · #NoHandsChallenge</text>
</svg>`;
}
