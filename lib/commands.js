// Hands-free mode: turn a spoken command (typed by Wispr Flow) into an app action. Pure, so it's unit-tested.

const NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  ek: 1, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
};

const clean = (s) =>
  ` ${(s || "").toLowerCase().replace(/[^\p{L}\p{N}#' ]+/gu, " ").replace(/\b(um+|uh+|okay|ok|so|please|plz|now|bhai|yaar|haan|achha|matlab)\b/g, " ").replace(/\s+/g, " ").trim()} `;

/** Numbers said as digits, "#3", English or Hindi words. Also "1 to 3" ranges. */
export function numbersIn(text) {
  const t = clean(text);
  const out = [];
  const range = t.match(/\b(\d+) (?:to|through|se) (\d+)\b/);
  if (range) for (let n = +range[1]; n <= +range[2] && n - +range[1] < 20; n++) out.push(n);
  for (const m of t.matchAll(/#?(\d+)|\b([a-z]+)\b/g)) {
    const n = m[1] ? Number(m[1]) : NUM[m[2]];
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

const TABS = [
  ["log", /\b(voice log|log|history)\b/],
  ["standup", /\b(stand ?up|daily|what happened)\b/],
  ["share", /\b(share|post|posts)\b/],
  ["plan", /\b(plan|planning|tickets tab)\b/],
];
const PERIODS = [[1, /\b(today|aaj)\b/], [14, /\b(two weeks|2 weeks|fortnight)\b/], [7, /\b(this week|week|hafta)\b/]];

/**
 * Returns one of:
 * {action:"undo"} {action:"sample"} {action:"help"} {action:"keys"} {action:"access"} {action:"export"}
 * {action:"apply", numbers?:[], all?:true} {action:"tick"|"untick", numbers|all}
 * {action:"run"} {action:"copy", target:"x"|"linkedin"|"changelog"} {action:"period", days}
 * {action:"tab", tab} {action:"answer", text} {action:"change", text} {action:"unknown"}
 */
export function parseCommand(raw) {
  const said = (raw || "").trim();
  const t = clean(said);
  if (!t.trim()) return { action: "unknown" };

  // "answer: ..." and "change: ..." carry free text, so check them on the raw words first
  const free = said.match(/^\s*(answer|reply|jawab|change|edit)\b[\s:,-]*(.+)$/is);
  if (free) return { action: /^(answer|reply|jawab)$/i.test(free[1]) ? "answer" : "change", text: free[2].trim() };

  if (/\b(undo|revert|wapas)\b/.test(t)) return { action: "undo" };
  if (/\b(shortcuts?|keyboard|keys)\b/.test(t)) return { action: "keys" };
  if (/\b(help|what can i say|commands)\b/.test(t)) return { action: "help" };
  if (/\b(sample|demo|example)\b/.test(t)) return { action: "sample" };
  if (/\b(check|test) (my )?(access|token)\b/.test(t)) return { action: "access" };
  if (/\b(export|download)\b.*\blog\b/.test(t)) return { action: "export" };

  const copy = t.match(/\bcopy\b.*\b(x|twitter|tweet|linkedin|changelog)\b/);
  if (copy) return { action: "copy", target: copy[1] === "linkedin" ? "linkedin" : copy[1] === "changelog" ? "changelog" : "x" };

  const nums = numbersIn(said);
  const all = /\b(all|everything|sab|saare|sabhi)\b/.test(t);
  if (/\b(skip|untick|remove|drop|hatao|exclude|deselect|not)\b/.test(t) && (nums.length || all))
    return { action: "untick", ...(all ? { all: true } : { numbers: nums }) };
  if (/\b(apply|create|approve|ship|post them|confirm|go ahead|kar do|bana do)\b/.test(t))
    return { action: "apply", ...(all ? { all: true } : nums.length ? { numbers: nums } : {}) };
  if (/\b(tick|select|include|keep|check)\b/.test(t) && (nums.length || all))
    return { action: "tick", ...(all ? { all: true } : { numbers: nums }) };

  if (/\b(go to|open|switch to|show|khol|chalo)\b/.test(t)) for (const [tab, re] of TABS) if (re.test(t)) return { action: "tab", tab };
  if (/\b(make tickets|make the tickets|run|go|start|propose|read my issues|write( the)? posts|update (the )?issues)\b/.test(t))
    return { action: "run" };
  for (const [days, re] of PERIODS) if (re.test(t)) return { action: "period", days };
  for (const [tab, re] of TABS) if (re.test(t)) return { action: "tab", tab };
  return { action: "unknown" };
}

export const COMMAND_HELP = [
  "“switch to standup” · “open share” · “show the log”",
  "“make tickets” · “read my issues” · “write the posts”",
  "“apply one and three” · “apply all” · “skip two” · “tick 4”",
  "“answer: the blog is about OfferRoom” · “change: make ticket 2 a P1”",
  "“this week” · “copy the X post” · “undo” · “load the sample” · “check access” · “show shortcuts”",
];
