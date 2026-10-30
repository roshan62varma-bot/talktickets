// The voice log: every run, what was said and what changed. Kept in this browser only.
const KEY = "tt-log";

export function readLog() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function addLog(entry) {
  const log = [{ at: new Date().toISOString(), ...entry }, ...readLog()].slice(0, 100);
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch { /* storage blocked: the log just won't persist */ }
  return log;
}

export function clearLog() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* fine */ }
}

export function totals(log) {
  const t = { runs: log.length, words: 0, fillers: 0, changes: 0 };
  for (const e of log) {
    t.words += e.words || 0;
    t.fillers += e.fillers || 0;
    t.changes += (e.results || []).filter((r) => r.ok).length;
  }
  return t;
}

export function toMarkdown(log) {
  const t = totals(log);
  const lines = [
    "# TalkTickets voice log",
    "",
    `${t.runs} runs, ${t.words} words spoken, ${t.fillers} filler words ignored, ${t.changes} GitHub changes made.`,
    "",
  ];
  for (const e of [...log].reverse()) {
    lines.push(`## ${new Date(e.at).toLocaleString()} · ${e.mode} · ${e.repo || "no repo"}`, "", `> ${(e.said || "").replace(/\n/g, " ")}`, "");
    for (const r of e.results || []) lines.push(`- ${r.ok ? "" : "(not done) "}${r.text}${r.url ? ` ${r.url}` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}
