import { actionComment, checkAction, issueBody, markSpeech, minutesSaved, parseRepo, quoteFound, unknownRefs, wordCount } from "./lib/text.js";
import * as GH from "./lib/github.js";
import { addLog, clearLog, readLog, toMarkdown, totals } from "./lib/log.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---------- the sample: a made-up hostel mess-menu app. No real repository is read or written. ----------
const SAMPLE_REPO = "sample/mess-menu-app";
const SAMPLE_PLAN = `Okay so, um, the mess menu app. First thing, the login page is broken on mobile, the the button gets cut off, that has to be fixed by Friday. Then, uh, students keep asking what's for dinner, so we need today's menu right on the home screen. Basically also a way to rate each meal, like one to five stars, matlab so the mess committee sees what people hate. And maybe later, if there's time, Hindi and Tamil versions of the menu.`;
const SAMPLE_EXISTING = [
  { number: 14, title: "Show today's menu on the home screen", url: "" },
  { number: 9, title: "Add dark mode", url: "" },
];
const SAMPLE_OPEN = [
  { number: 3, title: "Fix login button cut off on mobile", body: "The login button is cut off on small screens.", labels: ["bug"], url: "" },
  { number: 4, title: "Show today's menu on the home screen", body: "Students keep asking what's for dinner.", labels: ["feature"], url: "" },
  { number: 5, title: "Add 1-5 star meal ratings", body: "So the mess committee sees which meals people dislike.", labels: ["feature"], url: "" },
  { number: 6, title: "Hindi and Tamil versions of the menu", body: "Later, if there's time.", labels: ["i18n"], url: "" },
];
const SAMPLE_STANDUP = `Okay so, um, yesterday the login thing got done, the button fits on mobile now, I checked on my phone. The home screen menu is half way, um, the API gives today's menu but the UI isn't built yet. Ratings are stuck, matlab I can't start until we decide which database to use. Oh and I found a new bug, the menu dates show in the wrong time zone at night. Today I'll start on the Hindi menu.`;
const SAMPLE_ACTIVITY = {
  closed: [{ number: 3, title: "Fix login button cut off on mobile", labels: ["bug"] }],
  active: [
    { number: 4, title: "Show today's menu on the home screen", labels: ["feature", "in-progress"] },
    { number: 5, title: "Add 1-5 star meal ratings", labels: ["feature", "blocked"] },
    { number: 7, title: "Menu dates show in the wrong time zone", labels: ["bug"] },
  ],
};

const isSample = () => $("repo").value.trim() === SAMPLE_REPO;
const repo = () => $("repo").value.trim();
const token = () => $("token").value.trim();

// ---------- shared: storage, status, speech view, tabs ----------
try {
  const saved = localStorage.getItem("tt-token");
  if (saved) { $("token").value = saved; $("remember").checked = true; }
  $("repo").value = localStorage.getItem("tt-repo") || "";
} catch { /* storage blocked: fine */ }

function remember() {
  try {
    if (!isSample()) localStorage.setItem("tt-repo", repo());
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

function speechStats(text) {
  const { fillers } = markSpeech(text);
  return { words: wordCount(text), fillers };
}

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
$("repo").addEventListener("input", updateTokenState);

$("check").onclick = () => busy($("check"), "access", "Checking…", async () => {
  if (isSample()) return setStatus("access", "That's the sample project; it isn't on GitHub.", "ok");
  const r = await GH.checkAccess(repo(), token());
  setStatus("access", r.text, r.ok ? "ok" : "err");
});

const TABS = ["plan", "standup", "share", "log"];
function showTab(name) {
  for (const t of TABS) {
    $(`tab-${t}`).setAttribute("aria-selected", String(t === name));
    $(`panel-${t}`).hidden = t !== name;
  }
  if (name === "log") renderLog();
  try { history.replaceState(null, "", `#${name}`); } catch { /* fine */ }
}
for (const t of TABS) $(`tab-${t}`).onclick = () => showTab(t);
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  const i = TABS.findIndex((t) => $(`tab-${t}`).getAttribute("aria-selected") === "true");
  const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : -1;
  if (next >= 0) { showTab(TABS[next]); $(`tab-${TABS[next]}`).focus(); }
});

// Ctrl/Cmd+Enter runs the button that belongs to the box you're in.
const RUNS = { transcript: "go", answers: "answer", instruction: "change", "s-transcript": "s-go", "h-note": "h-go" };
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && RUNS[e.target.id]) { e.preventDefault(); $(RUNS[e.target.id]).click(); }
});

// ================= PLAN =================
const plan = { tickets: [], existing: [], transcript: "", answers: "" };

async function callPlan(extra = {}) {
  const { tickets } = await api("/api/plan", {
    transcript: plan.transcript, answers: plan.answers,
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
    // unverified or duplicate tickets start unticked: the person has to pick them on purpose
    const approved = prev.has(t.title) ? prev.get(t.title) : verified && !dup;
    return { ...t, verified, dup, approved };
  });
  renderPlan();
}

const issueLink = (i) => (i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">#${i.number}</a>` : `#${i.number}`);

function ticketHTML(t, i) {
  const dup = t.dup ? `<p class="trace bad">Already exists as ${issueLink(t.dup)} ${esc(t.dup.title)}</p>` : "";
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
      <div class="facts">
        <span><b>Done when</b> ${esc(t.done_when)}</span>
        ${t.due ? `<span><b>Due</b> ${esc(t.due)}</span>` : ""}
        ${t.labels.map((l) => `<span class="tag">${esc(l)}</span>`).join("")}
      </div>
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
  $("create").textContent = `${token() && !isSample() ? "Create" : "Preview"} ${plural(n, "issue")}`;
}

$("tickets").addEventListener("change", (e) => {
  const i = e.target.dataset.i;
  if (i !== undefined) { plan.tickets[i].approved = e.target.checked; renderPlan(); }
});
$("sample").onclick = () => {
  $("repo").value = SAMPLE_REPO;
  $("transcript").value = SAMPLE_PLAN;
  showSpeech("speech", SAMPLE_PLAN);
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
  plan.existing = isSample() ? SAMPLE_EXISTING : parseRepo(repo()) ? await GH.openIssues(repo(), token()).catch(() => []) : [];
  acceptTickets(await callPlan());
  const checked = plan.existing.length ? `, checked against ${plural(plan.existing.length, "open issue")}` : "";
  setStatus("status", `${plural(plan.tickets.length, "ticket")}${checked}.`, "ok");
  if (matchMedia("(max-width: 900px)").matches) $("tickets").scrollIntoView({ behavior: "smooth" });
});

function refine(button, extra) {
  return busy(button, "status", "Updating the tickets…", async () => {
    acceptTickets(await callPlan({ tickets: plan.tickets.map(({ verified, dup, approved, ...t }) => t), ...extra }));
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
  if (!token() || isSample()) {
    $("created").innerHTML = chosen.map((t) => `<li><b>${esc(t.title)}</b><pre>${esc(issueBody(t))}</pre></li>`).join("");
    addLog({ mode: "plan", repo: repo(), said: plan.transcript, ...stats, results: chosen.map((t) => ({ ok: false, text: `Previewed: ${t.title}` })) });
    const why = isSample() ? "This is the sample project, so nothing is created." : "Add a token at the top to create them for real.";
    return setStatus("shipstatus", `Preview: exactly what would be created. ${why}`, "ok");
  }
  $("create").disabled = true;
  $("created").innerHTML = "";
  const results = [];
  for (const t of chosen) {
    setStatus("shipstatus", `Creating ${results.length + 1} of ${chosen.length}…`);
    try {
      const d = await GH.createIssue(repo(), token(), { title: t.title, body: issueBody(t), labels: t.labels });
      t.approved = false;
      results.push({ ok: true, text: `Created #${d.number} ${d.title}`, url: d.html_url });
      $("created").insertAdjacentHTML("beforeend", `<li>Created <a href="${esc(d.html_url)}" target="_blank" rel="noopener">#${d.number} ${esc(d.title)}</a></li>`);
    } catch (e) {
      results.push({ ok: false, text: `Not created: ${t.title} (${e.message})` });
      $("created").insertAdjacentHTML("beforeend", `<li>Not created: ${esc(t.title)}. ${esc(e.message)}</li>`);
    }
  }
  addLog({ mode: "plan", repo: repo(), said: plan.transcript, ...stats, results });
  $("create").disabled = false;
  renderPlan();
  const ok = results.filter((r) => r.ok).length;
  setStatus("shipstatus", `Created ${ok} of ${chosen.length}.`, ok === chosen.length ? "ok" : "err");
};

// ================= STANDUP =================
const standup = { actions: [], open: [], transcript: "" };
const KIND = {
  done: { label: "Done", what: "Close the issue with this note" },
  progress: { label: "Progress", what: "Comment on the issue" },
  blocked: { label: "Blocked", what: "Add the blocked label and comment" },
  started: { label: "Started", what: "Add the in-progress label and comment" },
  new: { label: "New", what: "Create a new issue" },
};

function actionHTML(a, i) {
  const target = a.type === "new"
    ? `<h4>${esc(a.title || "New issue")}</h4>`
    : a.knownIssue
      ? `<h4>${issueLink(a.target)} ${esc(a.target.title)}</h4>`
      : `<h4>#${a.issue} <span class="muted">isn't an open issue here</span></h4>`;
  const conf = a.type !== "new" && a.confidence !== "high" ? `<span class="tag">${esc(a.confidence)} match</span>` : "";
  return `
  <article class="stub action ${a.tick ? "" : "off"}">
    <div class="stub-l">
      <span class="kind ${esc(a.type)}">${KIND[a.type].label}</span>
      <input type="checkbox" class="pick" data-i="${i}" ${a.tick ? "checked" : ""} aria-label="Apply update ${i + 1}">
    </div>
    <div class="stub-r">
      ${target}
      <p class="body">${esc(a.note)}</p>
      <div class="facts"><span>${KIND[a.type].what}</span>${conf}${(a.labels || []).map((l) => `<span class="tag">${esc(l)}</span>`).join("")}</div>
      <p class="trace ${a.verified ? "ok" : "bad"}">${a.verified ? "You said" : "Not found in what you said"}: <q>${esc(a.quote)}</q></p>
    </div>
  </article>`;
}

function renderStandup() {
  const has = standup.actions.length > 0;
  $("s-empty").hidden = has;
  $("s-ship").hidden = !has;
  $("s-actions").innerHTML = standup.actions.map(actionHTML).join("");
  const n = standup.actions.filter((a) => a.tick).length;
  $("s-apply").textContent = `${token() && !isSample() ? "Apply" : "Preview"} ${plural(n, "update")}`;
}

$("s-actions").addEventListener("change", (e) => {
  const i = e.target.dataset.i;
  if (i !== undefined) { standup.actions[i].tick = e.target.checked; renderStandup(); }
});
$("s-sample").onclick = () => {
  $("repo").value = SAMPLE_REPO;
  $("s-transcript").value = SAMPLE_STANDUP;
  showSpeech("s-speech", SAMPLE_STANDUP);
  updateTokenState();
};
$("s-transcript").addEventListener("input", () => showSpeech("s-speech", $("s-transcript").value));

$("s-go").onclick = () => busy($("s-go"), "s-status", "Reading your open issues…", async () => {
  standup.transcript = $("s-transcript").value.trim();
  standup.actions = [];
  renderStandup();
  if (!standup.transcript) return setStatus("s-status", "Say your standup in the box first.", "err");
  if (!isSample() && !parseRepo(repo())) return setStatus("s-status", "Add the repository at the top first.", "err");
  remember();
  showSpeech("s-speech", standup.transcript);
  standup.open = isSample() ? SAMPLE_OPEN : await GH.openIssues(repo(), token());
  if (!standup.open.length) return setStatus("s-status", "This repository has no open issues. Make some in Plan first.", "err");
  setStatus("s-status", `Matching what you said to ${plural(standup.open.length, "open issue")}…`);
  const { actions, summary } = await api("/api/standup", { transcript: standup.transcript, issues: standup.open });
  const numbers = standup.open.map((o) => o.number);
  standup.actions = actions.map((a) => ({ ...a, target: standup.open.find((o) => o.number === a.issue), ...checkAction(a, numbers, standup.transcript) }));
  $("s-summary").hidden = !summary;
  $("s-summary").textContent = summary;
  renderStandup();
  setStatus("s-status", `${plural(standup.actions.length, "update")} proposed.`, "ok");
});

async function applyAction(a) {
  const r = repo(), t = token();
  if (a.type === "new") {
    const d = await GH.createIssue(r, t, { title: a.title || "New issue", body: actionComment({ ...a, type: "new" }), labels: a.labels || [] });
    return { text: `Created #${d.number} ${d.title}`, url: d.html_url };
  }
  const c = await GH.comment(r, t, a.issue, actionComment(a));
  if (a.type === "done") await GH.closeIssue(r, t, a.issue);
  if (a.type === "blocked") await GH.addLabels(r, t, a.issue, ["blocked"]);
  if (a.type === "started") await GH.addLabels(r, t, a.issue, ["in-progress"]);
  const verb = { done: "Closed", progress: "Commented on", blocked: "Flagged blocked:", started: "Marked in progress:" }[a.type];
  return { text: `${verb} #${a.issue} ${a.target?.title || ""}`.trim(), url: c.html_url };
}

$("s-apply").onclick = async () => {
  const chosen = standup.actions.filter((a) => a.tick);
  if (!chosen.length) return setStatus("s-shipstatus", "Tick at least one update.", "err");
  remember();
  const stats = speechStats(standup.transcript);
  if (!token() || isSample()) {
    $("s-done").innerHTML = chosen.map((a) => `<li><b>${KIND[a.type].label}${a.type === "new" ? `: ${esc(a.title)}` : ` #${a.issue}`}</b><pre>${esc(actionComment(a))}</pre></li>`).join("");
    addLog({ mode: "standup", repo: repo(), said: standup.transcript, ...stats, results: chosen.map((a) => ({ ok: false, text: `Previewed: ${KIND[a.type].label} ${a.type === "new" ? a.title : `#${a.issue}`}` })) });
    const why = isSample() ? "This is the sample project, so nothing changes." : "Add a token at the top to apply them for real.";
    return setStatus("s-shipstatus", `Preview: exactly what would be posted. ${why}`, "ok");
  }
  $("s-apply").disabled = true;
  $("s-done").innerHTML = "";
  const results = [];
  for (const a of chosen) {
    setStatus("s-shipstatus", `Applying ${results.length + 1} of ${chosen.length}…`);
    try {
      const r = await applyAction(a);
      a.tick = false;
      results.push({ ok: true, ...r });
      $("s-done").insertAdjacentHTML("beforeend", `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.text)}</a></li>`);
    } catch (e) {
      results.push({ ok: false, text: `Not applied: ${KIND[a.type].label} ${a.issue ? `#${a.issue}` : a.title} (${e.message})` });
      $("s-done").insertAdjacentHTML("beforeend", `<li>Not applied: ${esc(KIND[a.type].label)} ${a.issue ? `#${a.issue}` : esc(a.title)}. ${esc(e.message)}</li>`);
    }
  }
  addLog({ mode: "standup", repo: repo(), said: standup.transcript, ...stats, results });
  $("s-apply").disabled = false;
  renderStandup();
  const ok = results.filter((r) => r.ok).length;
  setStatus("s-shipstatus", `Applied ${ok} of ${chosen.length}.`, ok === chosen.length ? "ok" : "err");
};

// ================= SHARE =================
let useSampleActivity = false;
$("h-sample").onclick = () => {
  useSampleActivity = true;
  $("repo").value = SAMPLE_REPO;
  updateTokenState();
  $("h-go").click();
};

function postCard(title, text, { limit, known }) {
  const bad = unknownRefs(text, known);
  const over = limit && text.length > limit;
  const checks = [
    bad.length ? `<p class="trace bad">Mentions ${bad.map((n) => `#${n}`).join(", ")}, which didn't happen in this period. Edit before posting.</p>`
      : `<p class="trace ok">Every issue it mentions happened in this period.</p>`,
    limit ? `<p class="trace ${over ? "bad" : "ok"}">${text.length} of ${limit} characters${over ? ". Too long for X." : "."}</p>` : "",
  ].join("");
  return `
  <article class="post">
    <div class="post-head"><h4>${esc(title)}</h4><button class="btn quiet copy" data-copy="${esc(text)}">Copy</button></div>
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
  const act = sample ? SAMPLE_ACTIVITY : await GH.activity(repo(), token(), days);
  const li = (i, cls) => `<li class="${cls}">#${i.number} ${esc(i.title)}</li>`;
  $("h-activity").hidden = false;
  $("h-activity").innerHTML = `<div class="count">${plural(act.closed.length, "issue")} closed, ${act.active.length} still open and active</div><ul>` +
    act.closed.map((i) => li(i, "closed")).join("") + act.active.map((i) => li(i, "open")).join("") + "</ul>";
  if (!act.closed.length && !act.active.length) return setStatus("h-status", "Nothing happened on this repository in that period yet.", "err");
  setStatus("h-status", "Writing the posts…");
  const note = $("h-note").value.trim();
  const out = await api("/api/share", { repo: sample ? "a hostel mess-menu app" : repo(), days, note, closed: act.closed, active: act.active });
  const known = [...act.closed, ...act.active].map((i) => i.number);
  $("h-empty").hidden = true;
  $("h-posts").innerHTML = postCard("X post", out.x_post, { limit: 280, known }) + postCard("LinkedIn post", out.linkedin_post, { known }) + postCard("Changelog (Markdown)", out.changelog, { known });
  if (note) addLog({ mode: "share", repo: sample ? SAMPLE_REPO : repo(), said: note, ...speechStats(note), results: [{ ok: true, text: `Wrote progress posts for the last ${plural(days, "day")}` }] });
  setStatus("h-status", "Posts written from real activity.", "ok");
});

$("h-posts").addEventListener("click", async (e) => {
  const b = e.target.closest(".copy");
  if (!b) return;
  try {
    await navigator.clipboard.writeText(b.dataset.copy);
    b.textContent = "Copied";
  } catch {
    b.textContent = "Select and copy";
  }
  setTimeout(() => (b.textContent = "Copy"), 1600);
});

// ================= LOG =================
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
        <div class="log-head"><span class="kind ${e.mode === "standup" ? "progress" : e.mode === "share" ? "started" : "new"}">${esc(e.mode)}</span>
          <span class="muted">${esc(new Date(e.at).toLocaleString())} · ${esc(e.repo || "")} · ${plural(e.words || 0, "word")}</span></div>
        <blockquote>${esc(e.said)}</blockquote>
        <ul>${(e.results || []).map((r) => `<li class="${r.ok ? "" : "muted"}">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.text)}</a>` : esc(r.text)}</li>`).join("")}</ul>
      </li>`).join("")
    : `<li class="empty"><p>Nothing yet.</p><p class="muted">Every plan, standup and share you run shows up here.</p></li>`;
}
$("l-export").onclick = () => {
  const blob = new Blob([toMarkdown(readLog())], { type: "text/markdown" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "talktickets-voice-log.md" });
  a.click();
  URL.revokeObjectURL(a.href);
};
$("l-clear").onclick = () => {
  if (confirm("Clear the voice log in this browser?")) { clearLog(); renderLog(); }
};

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
