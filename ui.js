import { actionComment, checkAction, issueBody, markSpeech, minutesSaved, parseRepo, quoteFound, unknownRefs, wordCount } from "./lib/text.js";
import * as GH from "./lib/github.js";
import { addLog, clearLog, readLog, toMarkdown, totals } from "./lib/log.js";
import { COMMAND_HELP, parseCommand } from "./lib/commands.js";
import { LETTERS, evidenceFor, nudges, parseSteps, progressCard, sameStep, standupPayload, tickSteps } from "./lib/work.js";
import * as S from "./lib/samples.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

const isSample = () => $("repo").value.trim() === S.SAMPLE_REPO;
const repo = () => $("repo").value.trim();
const token = () => $("token").value.trim();
const lang = () => $("lang").value;
const live = () => Boolean(token()) && !isSample();
/** How an issue is named to the person: "#5" for one repo, "app#5" when several are in play. */
const dref = (repos, r, n) => (repos.length > 1 ? `${r.split("/").pop()}#${n}` : `#${n}`);

// ---------- shared: storage, status, speech view, tabs ----------
try {
  const saved = localStorage.getItem("tt-token");
  if (saved) { $("token").value = saved; $("remember").checked = true; }
  $("repo").value = localStorage.getItem("tt-repo") || "";
  $("lang").value = localStorage.getItem("tt-lang") || "en";
  $("s-more").value = localStorage.getItem("tt-more") || "";
} catch { /* storage blocked: fine */ }

function remember() {
  try {
    if (!isSample()) {
      localStorage.setItem("tt-repo", repo());
      localStorage.setItem("tt-more", $("s-more").value.trim());
    }
    localStorage.setItem("tt-lang", lang());
    $("remember").checked && token() ? localStorage.setItem("tt-token", token()) : localStorage.removeItem("tt-token");
  } catch { /* fine */ }
}

function setStatus(id, text, kind = "") {
  $(id).textContent = text;
  $(id).className = `status ${kind}`;
}

function showSpeech(id, text) {
  const { parts, fillers, repeats } = markSpeech(text);
  const el = $(id);
  if (!fillers && !repeats) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="count">Heard ${plural(fillers, "filler")} and ${plural(repeats, "repeat")}. They're ignored.</div><p>` +
    parts.map((p) => (p.kind ? `<s>${esc(p.text)}</s>` : esc(p.text))).join("") + "</p>";
}

const speechStats = (text) => ({ words: wordCount(text), fillers: markSpeech(text).fillers });

async function api(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The server answered ${res.status}. Try again.`);
  return data;
}

async function busy(button, statusId, text, fn) {
  button.disabled = true;
  setStatus(statusId, text);
  try {
    await fn();
  } catch (e) {
    setStatus(statusId, e.message, "err");
  } finally {
    button.disabled = false;
  }
}

function updateTokenState() {
  $("tokenstate").textContent = isSample() ? "not used for the sample" : token() ? "set" : "not set: previews only";
  renderPlan();
  renderStandup();
}
$("token").addEventListener("input", updateTokenState);
$("repo").addEventListener("input", () => { updateTokenState(); scheduleNudges(); });
$("s-more").addEventListener("input", scheduleNudges);
$("lang").addEventListener("change", remember);

$("check").onclick = () => busy($("check"), "access", "Checking…", async () => {
  if (isSample()) return setStatus("access", "That's the sample project; it isn't on GitHub.", "ok");
  const r = await GH.checkAccess(repo(), token());
  setStatus("access", r.text, r.ok ? "ok" : "err");
});

const TABS = ["plan", "standup", "share", "log"];
const activeTab = () => TABS.find((t) => $(`tab-${t}`).getAttribute("aria-selected") === "true");
function showTab(name) {
  for (const t of TABS) {
    $(`tab-${t}`).setAttribute("aria-selected", String(t === name));
    $(`panel-${t}`).hidden = t !== name;
  }
  if (name === "log") renderLog();
  if (name === "standup") scheduleNudges(0);
  try { history.replaceState(null, "", `${location.search}#${name}`); } catch { /* fine */ }
}
for (const t of TABS) $(`tab-${t}`).onclick = () => showTab(t);
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  const i = TABS.indexOf(activeTab());
  const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : -1;
  if (next >= 0) { showTab(TABS[next]); $(`tab-${TABS[next]}`).focus(); }
});

// Ctrl/Cmd+Enter runs the button that belongs to the box you're in; Ctrl+K opens the command bar; "?" shows the shortcuts.
const RUNS = { transcript: "go", answers: "answer", instruction: "change", "s-transcript": "s-go", "h-note": "h-go" };
const typing = (el) => el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
const showKeys = () => { if (!$("keys").open) $("keys").showModal(); };
$("keys-open").onclick = showKeys;
$("keys").addEventListener("click", (e) => { if (e.target === $("keys")) $("keys").close(); }); // click outside closes
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && RUNS[e.target.id]) { e.preventDefault(); $(RUNS[e.target.id]).click(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("keys").close(); $("cmd-in").focus(); }
  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) { e.preventDefault(); showKeys(); }
});

// ---------- GitHub sign-in (only when the server has it set up) ----------
(async () => {
  try {
    const t = sessionStorage.getItem("tt-oauth");
    const err = sessionStorage.getItem("tt-oauth-error");
    sessionStorage.removeItem("tt-oauth");
    sessionStorage.removeItem("tt-oauth-error");
    if (t) { $("token").value = t; updateTokenState(); setStatus("access", "Signed in with GitHub.", "ok"); }
    if (err) { $("tokenbox").open = true; setStatus("access", err, "err"); }
  } catch { /* fine */ }
  try {
    const r = await fetch("/api/auth/config");
    if (r.ok && (await r.json()).enabled) $("signin").hidden = false;
  } catch { /* no sign-in: tokens still work */ }
})();

// ---------- undo: every change that reaches GitHub records how to take it back ----------
function readUndo() {
  try { return JSON.parse(localStorage.getItem("tt-undo") || "null"); } catch { return null; }
}
function saveUndo(label, ops) {
  try { ops.length ? localStorage.setItem("tt-undo", JSON.stringify({ at: Date.now(), label, ops })) : localStorage.removeItem("tt-undo"); } catch { /* fine */ }
  showUndo();
}
function showUndo() {
  const u = readUndo();
  $("undo").hidden = !u;
  if (u) $("undo").textContent = `Undo: ${u.label}`;
}
const INVERSE = {
  closeIssue: (o, t) => GH.closeNotPlanned(o.repo, t, o.n),
  deleteComment: (o, t) => GH.deleteComment(o.repo, t, o.id),
  reopen: (o, t) => GH.reopenIssue(o.repo, t, o.n),
  removeLabel: (o, t) => GH.removeLabel(o.repo, t, o.n, o.label),
  unassign: (o, t) => GH.removeAssignees(o.repo, t, o.n, [o.login]),
  setBody: (o, t) => GH.setBody(o.repo, t, o.n, o.body),
};
async function undoLast() {
  const u = readUndo();
  if (!u) return say("There's nothing to undo.");
  if (!token()) return say("Undo needs the GitHub token that made the changes.", "err");
  if (!confirm(`Undo ${u.label}? This reverses ${plural(u.ops.length, "change")} on GitHub.`)) return;
  $("undo").disabled = true;
  const failed = [];
  for (const o of [...u.ops].reverse()) {
    try { await INVERSE[o.op](o, token()); } catch (e) { failed.push(`${o.op} on ${o.repo}#${o.n || ""}: ${e.message}`); }
  }
  $("undo").disabled = false;
  addLog({ mode: "undo", repo: u.ops[0]?.repo || "", said: "", words: 0, fillers: 0,
    results: [{ ok: !failed.length, text: failed.length ? `Undo partly failed: ${failed.join("; ")}` : `Undid ${u.label}` }] });
  saveUndo("", []);
  say(failed.length ? `Undo partly failed: ${failed[0]}` : `Undone: ${u.label}.`, failed.length ? "err" : "ok");
}
$("undo").onclick = undoLast;
showUndo();

// ---------- assignees ----------
const loginCache = new Map();
async function loginsFor(r) {
  if (r === S.SAMPLE_REPO || r === S.SAMPLE_REPO_2) return S.ASSIGNEES;
  if (!loginCache.has(r)) loginCache.set(r, await GH.assignees(r, token()).catch(() => []));
  return loginCache.get(r);
}

// ================= PLAN =================
const plan = { tickets: [], existing: [], transcript: "", answers: "", logins: [] };

async function callPlan(extra = {}) {
  if (isSample() && plan.transcript === S.PLAN && !plan.answers && !extra.instruction && !extra.tickets && lang() === "en")
    return structuredClone(S.CACHED.plan.tickets);
  const { tickets } = await api("/api/plan", {
    transcript: plan.transcript, answers: plan.answers, lang: lang(),
    existing: plan.existing.map(({ number, title }) => ({ number, title })), ...extra,
  });
  return tickets;
}

function acceptTickets(tickets) {
  const source = `${plan.transcript}\n${plan.answers}`;
  const prev = new Map(plan.tickets.map((t) => [t.title, t.approved]));
  plan.tickets = tickets.map((t) => {
    const verified = quoteFound(t.quote, source);
    const dup = t.duplicate_of ? plan.existing.find((e) => e.number === t.duplicate_of) : null;
    const login = t.assignee ? GH.matchLogin(t.assignee, plan.logins) : null;
    // unverified or duplicate tickets start unticked: the person has to pick them on purpose
    const approved = prev.has(t.title) ? prev.get(t.title) : verified && !dup;
    return { ...t, steps: t.steps || [], verified, dup, login, approved };
  });
  renderPlan();
}

const issueLink = (i, label = `#${i.number}`) => (i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label));
const who = (name, login) => !name ? ""
  : login ? `<span class="tag who">Assign to @${esc(login)}</span>`
  : `<p class="trace bad">You said ${esc(name)} should do this, but nobody by that name can be assigned here.</p>`;

function ticketHTML(t, i) {
  const dup = t.dup ? `<p class="trace bad">Already exists as ${issueLink(t.dup)} ${esc(t.dup.title)}</p>` : "";
  const steps = t.steps.length ? `<ul class="steps">${t.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "";
  return `
  <article class="stub ticket ${t.approved ? "" : "off"}">
    <div class="stub-l">
      <b>${i + 1}</b>
      <span class="pri ${esc(t.priority).toLowerCase()}">${esc(t.priority)}</span>
      <input type="checkbox" class="pick" data-i="${i}" ${t.approved ? "checked" : ""} aria-label="Create ticket ${i + 1}">
    </div>
    <div class="stub-r">
      <h4>${esc(t.title)}</h4>
      <p class="body">${esc(t.body)}</p>
      ${steps}
      <div class="facts">
        <span><b>Done when</b> ${esc(t.done_when)}</span>
        ${t.due ? `<span><b>Due</b> ${esc(t.due)}</span>` : ""}
        ${t.labels.map((l) => `<span class="tag">${esc(l)}</span>`).join("")}
        ${t.login ? who(t.assignee, t.login) : ""}
      </div>
      ${!t.login ? who(t.assignee, null) : ""}
      <p class="trace ${t.verified ? "ok" : "bad"}">${t.verified ? "You said" : "Not found in what you said"}: <q>${esc(t.quote)}</q></p>
      ${dup}
    </div>
  </article>`;
}

function renderPlan() {
  const has = plan.tickets.length > 0;
  $("empty").hidden = has;
  $("changebox").hidden = $("step-ship").hidden = !has;
  $("tickets").innerHTML = plan.tickets.map(ticketHTML).join("");
  const qs = plan.tickets.flatMap((t, i) => t.questions.map((q) => `<li><b>Ticket ${i + 1}:</b> ${esc(q)}</li>`));
  $("ask").hidden = !qs.length;
  $("questions").innerHTML = qs.join("");
  const n = plan.tickets.filter((t) => t.approved).length;
  $("create").textContent = `${live() ? "Create" : "Preview"} ${plural(n, "issue")}`;
}

$("tickets").addEventListener("change", (e) => {
  const i = e.target.dataset.i;
  if (i !== undefined) { plan.tickets[i].approved = e.target.checked; renderPlan(); }
});
$("sample").onclick = () => {
  $("repo").value = S.SAMPLE_REPO;
  $("transcript").value = S.PLAN;
  showSpeech("speech", S.PLAN);
  updateTokenState();
};
$("transcript").addEventListener("input", () => showSpeech("speech", $("transcript").value));

$("go").onclick = () => busy($("go"), "status", "Reading what you said and writing tickets…", async () => {
  plan.transcript = $("transcript").value.trim();
  plan.answers = "";
  plan.tickets = [];
  if (!plan.transcript) return setStatus("status", "Say your plan in the box first.", "err");
  remember();
  showSpeech("speech", plan.transcript);
  const r = parseRepo(repo()) ? repo() : "";
  plan.existing = isSample() ? S.EXISTING : r ? await GH.openIssues(r, token()).catch(() => []) : [];
  plan.logins = r ? await loginsFor(r) : [];
  acceptTickets(await callPlan());
  const checked = plan.existing.length ? `, checked against ${plural(plan.existing.length, "open issue")}` : "";
  setStatus("status", `${plural(plan.tickets.length, "ticket")}${checked}.`, "ok");
  if (matchMedia("(max-width: 900px)").matches) $("tickets").scrollIntoView({ behavior: "smooth" });
});

function refine(button, extra) {
  return busy(button, "status", "Updating the tickets…", async () => {
    acceptTickets(await callPlan({ tickets: plan.tickets.map(({ verified, dup, approved, login, ...t }) => t), ...extra }));
    setStatus("status", "Tickets updated.", "ok");
  });
}
$("answer").onclick = () => {
  const a = $("answers").value.trim();
  if (!a) return;
  plan.answers = [plan.answers, a].filter(Boolean).join("\n");
  $("answers").value = "";
  refine($("answer"), {});
};
$("change").onclick = () => {
  const ins = $("instruction").value.trim();
  if (!ins) return;
  $("instruction").value = "";
  refine($("change"), { instruction: ins });
};

$("create").onclick = async () => {
  const chosen = plan.tickets.filter((t) => t.approved);
  if (!parseRepo(repo())) return setStatus("shipstatus", "Add the repository at the top first.", "err");
  if (!chosen.length) return setStatus("shipstatus", "Tick at least one ticket.", "err");
  remember();
  const stats = speechStats(`${plan.transcript} ${plan.answers}`);
  if (!live()) {
    $("created").innerHTML = chosen.map((t) => `<li><b>${esc(t.title)}</b>${t.login ? ` <span class="muted">→ @${esc(t.login)}</span>` : ""}<pre>${esc(issueBody(t))}</pre></li>`).join("");
    addLog({ mode: "plan", repo: repo(), said: plan.transcript, ...stats, results: chosen.map((t) => ({ ok: false, text: `Previewed: ${t.title}` })) });
    const why = isSample() ? "This is the sample project, so nothing is created." : "Add a token at the top to create them for real.";
    return setStatus("shipstatus", `Preview: exactly what would be created. ${why}`, "ok");
  }
  $("create").disabled = true;
  $("created").innerHTML = "";
  const results = [];
  const ops = [];
  for (const t of chosen) {
    setStatus("shipstatus", `Creating ${results.length + 1} of ${chosen.length}…`);
    try {
      const d = await GH.createIssue(repo(), token(), { title: t.title, body: issueBody(t), labels: t.labels, assignees: t.login ? [t.login] : [] });
      ops.push({ op: "closeIssue", repo: repo(), n: d.number });
      t.approved = false;
      results.push({ ok: true, text: `Created #${d.number} ${d.title}`, url: d.html_url });
      $("created").insertAdjacentHTML("beforeend", `<li>Created <a href="${esc(d.html_url)}" target="_blank" rel="noopener">#${d.number} ${esc(d.title)}</a></li>`);
    } catch (e) {
      results.push({ ok: false, text: `Not created: ${t.title} (${e.message})` });
      $("created").insertAdjacentHTML("beforeend", `<li>Not created: ${esc(t.title)}. ${esc(e.message)}</li>`);
    }
  }
  saveUndo(`${plural(ops.length, "new issue")}`, ops);
  addLog({ mode: "plan", repo: repo(), said: plan.transcript, ...stats, results });
  $("create").disabled = false;
  renderPlan();
  const ok = results.filter((r) => r.ok).length;
  setStatus("shipstatus", `Created ${ok} of ${chosen.length}.`, ok === chosen.length ? "ok" : "err");
};

// ================= STANDUP =================
const standup = { actions: [], open: [], commits: [], transcript: "", repos: [] };
const KIND = {
  done: { label: "Done", what: "Close the issue with this note" },
  progress: { label: "Progress", what: "Comment on the issue" },
  blocked: { label: "Blocked", what: "Add the blocked label and comment" },
  started: { label: "Started", what: "Add the in-progress label and comment" },
  new: { label: "New", what: "Create a new issue" },
};

function reposInPlay() {
  if (isSample()) return [S.SAMPLE_REPO, S.SAMPLE_REPO_2];
  const extra = $("s-more").value.split(/[,\s]+/).map((r) => r.trim()).filter((r) => parseRepo(r));
  return [...new Set([repo(), ...extra])].filter((r) => parseRepo(r)).slice(0, 4);
}

async function loadOpen(repos) {
  if (isSample()) return S.openIssues();
  const lists = await Promise.all(repos.map(async (r) => (await GH.openIssues(r, token())).map((i) => ({ ...i, repo: r }))));
  return lists.flat();
}

// nudges: shown before you talk, from your open issues and your last standup
let nudgeTimer = 0;
function scheduleNudges(delay = 600) {
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(showNudges, delay);
}
async function showNudges() {
  const repos = reposInPlay();
  const box = $("s-nudges");
  if (!repos.length || activeTab() !== "standup") return;
  try {
    const open = await loadOpen(repos);
    const named = open.map((i) => ({ ...i, ref: dref(repos, i.repo, i.number) }));
    const log = isSample() ? [S.LAST_STANDUP] : readLog();
    const list = nudges(named, log);
    box.hidden = !list.length;
    box.innerHTML = `<h3>Before you talk</h3><ul>${list.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul>`;
  } catch {
    box.hidden = true;
  }
}

function actionHTML(a, i) {
  const target = a.type === "new"
    ? `<h4>${esc(a.title || "New issue")} <span class="muted">in ${esc(a.repoName.split("/").pop())}</span></h4>`
    : a.knownIssue
      ? `<h4>${issueLink(a.target, a.shown)} ${esc(a.target.title)}</h4>`
      : `<h4>${esc(a.ref)} <span class="muted">isn't an open issue here</span></h4>`;
  const conf = a.type !== "new" && a.confidence !== "high" ? `<span class="tag">${esc(a.confidence)} match</span>` : "";
  const steps = a.steps.length ? `<p class="trace ok">Ticks the checklist: ${a.steps.map(esc).join(", ")}</p>` : "";
  const proof = a.proof.length
    ? `<p class="trace ok">Code agrees: ${a.proof.map((c) => `${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.sha.slice(0, 7))}</a>` : esc(c.sha.slice(0, 7))} ${esc(c.message)}`).join("; ")}</p>`
    : a.type === "done" ? `<p class="trace bad">No recent commit mentions this. Fine if the work wasn't code; check before closing.</p>` : "";
  return `
  <article class="stub action ${a.tick ? "" : "off"}">
    <div class="stub-l">
      <b>${i + 1}</b>
      <span class="kind ${esc(a.type)}">${KIND[a.type].label}</span>
      <input type="checkbox" class="pick" data-i="${i}" ${a.tick ? "checked" : ""} aria-label="Apply update ${i + 1}">
    </div>
    <div class="stub-r">
      ${target}
      <p class="body">${esc(a.note)}</p>
      <div class="facts"><span>${KIND[a.type].what}</span>${conf}${(a.labels || []).map((l) => `<span class="tag">${esc(l)}</span>`).join("")}${a.login ? who(a.assignee, a.login) : ""}</div>
      ${!a.login ? who(a.assignee, null) : ""}
      ${steps}${proof}
      <p class="trace ${a.verified ? "ok" : "bad"}">${a.verified ? "You said" : "Not found in what you said"}: <q>${esc(a.quote)}</q></p>
      ${a.risky ? `<p class="trace bad">This note has a link or @mention you didn't say. It may come from text inside an issue. Check it before ticking.</p>` : ""}
    </div>
  </article>`;
}

function renderStandup() {
  const has = standup.actions.length > 0;
  $("s-empty").hidden = has;
  $("s-ship").hidden = !has;
  $("s-actions").innerHTML = standup.actions.map(actionHTML).join("");
  const n = standup.actions.filter((a) => a.tick).length;
  $("s-apply").textContent = `${live() ? "Apply" : "Preview"} ${plural(n, "update")}`;
}

$("s-actions").addEventListener("change", (e) => {
  const i = e.target.dataset.i;
  if (i !== undefined) { standup.actions[i].tick = e.target.checked; renderStandup(); }
});
$("s-sample").onclick = () => {
  $("repo").value = S.SAMPLE_REPO;
  $("s-transcript").value = S.STANDUP;
  showSpeech("s-speech", S.STANDUP);
  updateTokenState();
  scheduleNudges(0);
};
$("s-transcript").addEventListener("input", () => showSpeech("s-speech", $("s-transcript").value));

$("s-go").onclick = () => busy($("s-go"), "s-status", "Reading your open issues and recent commits…", async () => {
  standup.transcript = $("s-transcript").value.trim();
  standup.actions = [];
  renderStandup();
  if (!standup.transcript) return setStatus("s-status", "Say your standup in the box first.", "err");
  const repos = reposInPlay();
  if (!repos.length) return setStatus("s-status", "Add the repository at the top first.", "err");
  remember();
  showSpeech("s-speech", standup.transcript);
  standup.repos = repos;
  standup.open = await loadOpen(repos);
  if (!standup.open.length) return setStatus("s-status", "These repositories have no open issues. Make some in Plan first.", "err");
  standup.commits = isSample() ? S.COMMITS
    : (await Promise.all(repos.map(async (r) => (await GH.commitsSince(r, token(), 3).catch(() => [])).map((c) => ({ ...c, repo: r }))))).flat();
  setStatus("s-status", `Matching what you said to ${plural(standup.open.length, "open issue")} and ${plural(standup.commits.length, "recent commit")}…`);

  const { actions, summary } = isSample() && standup.transcript === S.STANDUP && lang() === "en"
    ? structuredClone(S.CACHED.standup)
    : await api("/api/standup", { transcript: standup.transcript, lang: lang(), ...standupPayload(repos, standup.open, standup.commits) });

  const refs = standup.open.map((o) => `${LETTERS[repos.indexOf(o.repo)]}#${o.number}`);
  standup.actions = [];
  for (const a of actions) {
    const repoName = repos[LETTERS.indexOf((a.ref || a.repo || "A")[0])] || repos[0];
    const target = standup.open.find((o) => o.repo === repoName && `${LETTERS[repos.indexOf(o.repo)]}#${o.number}` === a.ref);
    const checks = checkAction(a, refs, standup.transcript);
    const openSteps = target ? parseSteps(target.body).filter((s) => !s.done).map((s) => s.text) : [];
    const steps = openSteps.filter((s) => (a.steps_done || []).some((d) => sameStep(d, s)));
    const login = a.assignee ? GH.matchLogin(a.assignee, await loginsFor(repoName)) : null;
    const proof = target ? evidenceFor(a, standup.commits.filter((c) => c.repo === repoName), target.number) : [];
    standup.actions.push({ ...a, ...checks, target, repoName, steps, login, proof, shown: target ? dref(repos, repoName, target.number) : "" });
  }
  $("s-summary").hidden = !summary;
  $("s-summary").textContent = summary;
  renderStandup();
  setStatus("s-status", `${plural(standup.actions.length, "update")} proposed across ${plural(repos.length, "repo")}.`, "ok");
});

async function applyAction(a, ops) {
  const r = a.repoName, t = token();
  if (a.type === "new") {
    const d = await GH.createIssue(r, t, { title: a.title || "New issue", body: actionComment({ ...a, type: "new" }), labels: a.labels || [], assignees: a.login ? [a.login] : [] });
    ops.push({ op: "closeIssue", repo: r, n: d.number });
    return { text: `Created ${d.title} (#${d.number})`, url: d.html_url };
  }
  const n = a.target.number;
  const c = await GH.comment(r, t, n, actionComment(a));
  ops.push({ op: "deleteComment", repo: r, n, id: c.id });
  if (a.steps.length) {
    const full = await GH.getIssue(r, t, n);
    const { body, ticked } = tickSteps(full.body || "", a.steps);
    if (ticked.length) {
      await GH.setBody(r, t, n, body);
      ops.push({ op: "setBody", repo: r, n, body: full.body || "" });
    }
  }
  const label = { blocked: "blocked", started: "in-progress" }[a.type];
  if (label && !a.target.labels.includes(label)) {
    await GH.addLabels(r, t, n, [label]);
    ops.push({ op: "removeLabel", repo: r, n, label });
  }
  if (a.login) {
    await GH.addAssignees(r, t, n, [a.login]);
    ops.push({ op: "unassign", repo: r, n, login: a.login });
  }
  if (a.type === "done") {
    await GH.closeIssue(r, t, n);
    ops.push({ op: "reopen", repo: r, n });
  }
  const verb = { done: "Closed", progress: "Commented on", blocked: "Flagged blocked:", started: "Marked in progress:" }[a.type];
  return { text: `${verb} ${a.shown} ${a.target.title}`, url: c.html_url };
}

$("s-apply").onclick = async () => {
  const chosen = standup.actions.filter((a) => a.tick);
  if (!chosen.length) return setStatus("s-shipstatus", "Tick at least one update.", "err");
  remember();
  const stats = speechStats(standup.transcript);
  const logActions = chosen.filter((a) => a.target).map((a) => ({ type: a.type, ref: a.shown }));
  if (!live()) {
    $("s-done").innerHTML = chosen.map((a) => `<li><b>${KIND[a.type].label} ${a.type === "new" ? esc(a.title) : esc(a.shown)}</b>${a.steps.length ? ` <span class="muted">· ticks ${esc(a.steps.join(", "))}</span>` : ""}${a.login ? ` <span class="muted">· assign @${esc(a.login)}</span>` : ""}<pre>${esc(actionComment(a))}</pre></li>`).join("");
    addLog({ mode: "standup", repo: standup.repos.join(", "), said: standup.transcript, ...stats, actions: logActions,
      results: chosen.map((a) => ({ ok: false, text: `Previewed: ${KIND[a.type].label} ${a.type === "new" ? a.title : a.shown}` })) });
    const why = isSample() ? "This is the sample project, so nothing changes." : "Add a token at the top to apply them for real.";
    return setStatus("s-shipstatus", `Preview: exactly what would be posted. ${why}`, "ok");
  }
  $("s-apply").disabled = true;
  $("s-done").innerHTML = "";
  const results = [];
  const ops = [];
  for (const a of chosen) {
    setStatus("s-shipstatus", `Applying ${results.length + 1} of ${chosen.length}…`);
    try {
      const r = await applyAction(a, ops);
      a.tick = false;
      results.push({ ok: true, ...r });
      $("s-done").insertAdjacentHTML("beforeend", `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.text)}</a></li>`);
    } catch (e) {
      const what = `${KIND[a.type].label} ${a.type === "new" ? a.title : a.shown}`;
      results.push({ ok: false, text: `Not applied: ${what} (${e.message})` });
      $("s-done").insertAdjacentHTML("beforeend", `<li>Not applied: ${esc(what)}. ${esc(e.message)}</li>`);
    }
  }
  saveUndo(`this standup (${plural(ops.length, "change")})`, ops);
  addLog({ mode: "standup", repo: standup.repos.join(", "), said: standup.transcript, ...stats, actions: logActions, results });
  $("s-apply").disabled = false;
  renderStandup();
  const ok = results.filter((r) => r.ok).length;
  setStatus("s-shipstatus", `Applied ${ok} of ${chosen.length}. Changed your mind? Use Undo at the bottom.`, ok === chosen.length ? "ok" : "err");
};

// ================= SHARE =================
let useSampleActivity = false;
let lastCard = "";
$("h-sample").onclick = () => {
  useSampleActivity = true;
  $("repo").value = S.SAMPLE_REPO;
  updateTokenState();
  $("h-go").click();
};

function postCard(title, text, kind, { limit, known }) {
  const bad = unknownRefs(text, known);
  const over = limit && text.length > limit;
  const checks = [
    bad.length ? `<p class="trace bad">Mentions ${bad.map((n) => `#${n}`).join(", ")}, which didn't happen in this period. Edit before posting.</p>`
      : `<p class="trace ok">Every issue it mentions happened in this period.</p>`,
    limit ? `<p class="trace ${over ? "bad" : "ok"}">${text.length} of ${limit} characters${over ? ". Too long for X." : "."}</p>` : "",
  ].join("");
  return `
  <article class="post">
    <div class="post-head"><h4>${esc(title)}</h4><button class="btn quiet copy" data-kind="${kind}" data-copy="${esc(text)}">Copy</button></div>
    <pre class="post-text">${esc(text)}</pre>
    ${checks}
  </article>`;
}

$("h-go").onclick = () => busy($("h-go"), "h-status", "Reading what happened on the repo…", async () => {
  const days = Number(document.querySelector('input[name="days"]:checked').value);
  const sample = useSampleActivity || isSample();
  useSampleActivity = false;
  if (!sample && !parseRepo(repo())) return setStatus("h-status", "Add the repository at the top first.", "err");
  remember();
  const act = sample ? S.ACTIVITY : await GH.activity(repo(), token(), days);
  const li = (i, cls) => `<li class="${cls}">#${i.number} ${esc(i.title)}</li>`;
  $("h-activity").hidden = false;
  $("h-activity").innerHTML = `<div class="count">${plural(act.closed.length, "issue")} closed, ${act.active.length} still open and active</div><ul>` +
    act.closed.map((i) => li(i, "closed")).join("") + act.active.map((i) => li(i, "open")).join("") + "</ul>";
  if (!act.closed.length && !act.active.length) return setStatus("h-status", "Nothing happened on this repository in that period yet.", "err");

  const project = sample ? "Hostel mess-menu app" : repo().split("/").pop();
  lastCard = progressCard({ project, days, closed: act.closed, active: act.active.map((i) => ({ ...i, labels: i.labels || [] })) });
  $("h-card").innerHTML = lastCard;
  $("h-cardbox").hidden = false;

  setStatus("h-status", "Writing the posts…");
  const note = $("h-note").value.trim();
  const out = sample && !note && days === 7
    ? S.CACHED.share
    : await api("/api/share", { repo: sample ? "a hostel mess-menu app" : repo(), days, note, closed: act.closed, active: act.active });
  const known = [...act.closed, ...act.active].map((i) => i.number);
  $("h-empty").hidden = true;
  $("h-posts").innerHTML = postCard("X post", out.x_post, "x", { limit: 280, known }) +
    postCard("LinkedIn post", out.linkedin_post, "linkedin", { known }) + postCard("Changelog (Markdown)", out.changelog, "changelog", { known });
  if (note) addLog({ mode: "share", repo: sample ? S.SAMPLE_REPO : repo(), said: note, ...speechStats(note), results: [{ ok: true, text: `Wrote progress posts for the last ${plural(days, "day")}` }] });
  setStatus("h-status", "Posts written from real activity.", "ok");
});

async function copyText(b) {
  try {
    await navigator.clipboard.writeText(b.dataset.copy);
    b.textContent = "Copied";
  } catch {
    b.textContent = "Select and copy";
  }
  setTimeout(() => (b.textContent = "Copy"), 1600);
}
$("h-posts").addEventListener("click", (e) => { const b = e.target.closest(".copy"); if (b) copyText(b); });

function download(name, blob) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("h-svg").onclick = () => lastCard && download("progress-card.svg", new Blob([lastCard], { type: "image/svg+xml" }));
$("h-png").onclick = () => {
  if (!lastCard) return;
  const img = new Image();
  img.onload = () => {
    const c = Object.assign(document.createElement("canvas"), { width: 1200, height: 630 });
    c.getContext("2d").drawImage(img, 0, 0);
    c.toBlob((b) => b && download("progress-card.png", b), "image/png");
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(new Blob([lastCard], { type: "image/svg+xml" }));
};

// ================= LOG =================
const LOGKIND = { standup: "progress", share: "started", undo: "blocked", plan: "new" };
function renderLog() {
  const log = readLog();
  const t = totals(log);
  $("l-totals").innerHTML = [
    [t.runs, "runs"], [t.words, "words spoken"], [t.fillers, "fillers ignored"], [t.changes, "GitHub changes"],
    [`~${Math.round(minutesSaved(t.words))} min`, "typing saved (estimate at 40 wpm)"],
  ].map(([n, l]) => `<div><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join("");
  $("l-list").innerHTML = log.length
    ? log.map((e) => `
      <li>
        <div class="log-head"><span class="kind ${LOGKIND[e.mode] || "new"}">${esc(e.mode)}</span>
          <span class="muted">${esc(new Date(e.at).toLocaleString())} · ${esc(e.repo || "")} · ${plural(e.words || 0, "word")}</span></div>
        ${e.said ? `<blockquote>${esc(e.said)}</blockquote>` : ""}
        <ul>${(e.results || []).map((r) => `<li class="${r.ok ? "" : "muted"}">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.text)}</a>` : esc(r.text)}</li>`).join("")}</ul>
      </li>`).join("")
    : `<li class="empty"><p>Nothing yet.</p><p class="muted">Every plan, standup and share you run shows up here.</p></li>`;
}
$("l-export").onclick = () => download("talktickets-voice-log.md", new Blob([toMarkdown(readLog())], { type: "text/markdown" }));
$("l-clear").onclick = () => {
  if (confirm("Clear the voice log in this browser?")) { clearLog(); renderLog(); }
};

// ================= HANDS-FREE COMMAND BAR =================
function say(text, kind = "") {
  $("cmd-out").textContent = text;
  $("cmd-out").className = `cmd-out ${kind}`;
}
$("cmd-list").innerHTML = COMMAND_HELP.map((h) => `<li>${esc(h)}</li>`).join("");
$("cmd-help").onclick = () => {
  const open = $("cmd-list").hidden;
  $("cmd-list").hidden = !open;
  $("cmd-help").setAttribute("aria-expanded", String(open));
};

/** Set ticks by number (1-based, as shown on the stubs) in the open tab's list. */
function setTicks(list, rerender, { numbers, all }, value, exclusive = false) {
  if (!list.length) return say("There's nothing to pick yet. Run it first.", "err"), false;
  const bad = (numbers || []).filter((n) => n < 1 || n > list.length);
  if (bad.length) return say(`There's no number ${bad.join(", ")} here; the list goes from 1 to ${list.length}.`, "err"), false;
  list.forEach((item, i) => {
    const hit = all || numbers.includes(i + 1);
    if (hit) item[item.approved !== undefined ? "approved" : "tick"] = value;
    else if (exclusive) item[item.approved !== undefined ? "approved" : "tick"] = !value;
  });
  rerender();
  return true;
}

function runCommand(text) {
  const c = parseCommand(text);
  const tab = activeTab();
  const list = tab === "plan" ? plan.tickets : standup.actions;
  const rerender = tab === "plan" ? renderPlan : renderStandup;
  switch (c.action) {
    case "tab": showTab(c.tab); return say(`Opened ${c.tab}.`, "ok");
    case "run": {
      const btn = { plan: "go", standup: "s-go", share: "h-go" }[tab];
      if (!btn) return say("There's nothing to run on this tab. Say “switch to plan” or “standup”.", "err");
      $(btn).click();
      return say("Running.", "ok");
    }
    case "sample": {
      if (tab === "plan") { $("sample").onclick(); $("go").click(); }
      else if (tab === "standup") { $("s-sample").onclick(); $("s-go").click(); }
      else if (tab === "share") $("h-sample").click();
      else return say("Open plan, standup or share first.", "err");
      return say("Loaded the sample.", "ok");
    }
    case "apply": {
      if (tab !== "plan" && tab !== "standup") return say("Apply works on plan and standup.", "err");
      if ((c.numbers || c.all) && !setTicks(list, rerender, c, true, Boolean(c.numbers))) return;
      $(tab === "plan" ? "create" : "s-apply").click();
      return say(c.numbers ? `Applying ${c.numbers.join(", ")}.` : "Applying the ticked ones.", "ok");
    }
    case "tick":
    case "untick":
      if (tab !== "plan" && tab !== "standup") return say("Ticking works on plan and standup.", "err");
      if (setTicks(list, rerender, c, c.action === "tick")) say(`${c.action === "tick" ? "Ticked" : "Unticked"} ${c.all ? "all" : c.numbers.join(", ")}.`, "ok");
      return;
    case "answer":
      showTab("plan");
      $("answers").value = c.text;
      if ($("ask").hidden) return say("There are no open questions right now.", "err");
      $("answer").click();
      return say("Answer sent.", "ok");
    case "change":
      showTab("plan");
      if (!plan.tickets.length) return say("Make tickets first, then ask for changes.", "err");
      $("instruction").value = c.text;
      $("change").click();
      return say("Change sent.", "ok");
    case "period": {
      const r = document.querySelector(`input[name="days"][value="${c.days}"]`);
      if (r) r.checked = true;
      showTab("share");
      return say(`Period set to ${c.days === 1 ? "today" : c.days === 7 ? "this week" : "two weeks"}.`, "ok");
    }
    case "copy": {
      const b = document.querySelector(`#h-posts .copy[data-kind="${c.target}"]`);
      if (!b) return say("Write the posts first (“switch to share”, then “write the posts”).", "err");
      copyText(b);
      return say(`Copied the ${c.target === "x" ? "X post" : c.target === "linkedin" ? "LinkedIn post" : "changelog"}.`, "ok");
    }
    case "undo": return undoLast();
    case "access": $("tokenbox").open = true; $("check").click(); return say("Checking access.", "ok");
    case "export": $("l-export").click(); return say("Downloaded the voice log.", "ok");
    case "help": $("cmd-list").hidden = false; return say("Here's what you can say.", "ok");
    case "keys": showKeys(); return say("Showing the keyboard shortcuts. Esc closes them.", "ok");
    default:
      $("cmd-list").hidden = false;
      return say(`I didn't catch a command in “${text.slice(0, 60)}”. Try one of these.`, "err");
  }
}
$("cmd").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("cmd-in").value.trim();
  if (!text) return;
  $("cmd-in").value = "";
  runCommand(text);
});

// ---------- start ----------
updateTokenState();
const start = location.hash.slice(1);
if (TABS.includes(start)) showTab(start);
// ?sample runs the sample for the open tab, so a link alone shows the whole flow.
if (new URLSearchParams(location.search).has("sample")) {
  const tab = TABS.includes(start) ? start : "plan";
  if (tab === "plan") { $("sample").onclick(); $("go").click(); }
  if (tab === "standup") { $("s-sample").onclick(); $("s-go").click(); }
  if (tab === "share") $("h-sample").click();
}
