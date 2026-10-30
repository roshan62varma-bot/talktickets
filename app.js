import { issueBody, markSpeech, parseRepo, quoteFound } from "./lib/text.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The sample is a made-up project: a hostel mess-menu app. No real repository is read or written.
const SAMPLE_REPO = "sample/mess-menu-app";
const SAMPLE = `Okay so, um, the mess menu app. First thing, the login page is broken on mobile, the the button gets cut off, that has to be fixed by Friday. Then, uh, students keep asking what's for dinner, so we need today's menu right on the home screen. Basically also a way to rate each meal, like one to five stars, matlab so the mess committee sees what people hate. And maybe later, if there's time, Hindi and Tamil versions of the menu.`;
const SAMPLE_EXISTING = [
  { number: 14, title: "Show today's menu on the home screen", url: "#" },
  { number: 9, title: "Add dark mode", url: "#" },
];

const state = { tickets: [], existing: [], transcript: "", answers: "", sample: false };

try {
  const saved = localStorage.getItem("tt-token");
  if (saved) { $("token").value = saved; $("remember").checked = true; }
  $("repo").value = localStorage.getItem("tt-repo") || "";
} catch { /* storage blocked: fine */ }

function setStatus(id, text, kind = "") {
  $(id).textContent = text;
  $(id).className = `status ${kind}`;
}

function showSpeech(text) {
  const { parts, fillers, repeats } = markSpeech(text);
  const el = $("speech");
  if (!fillers && !repeats) { el.hidden = true; return; }
  el.hidden = false;
  const n = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  el.innerHTML = `<div class="count">Heard ${n(fillers, "filler")} and ${n(repeats, "repeat")}. They're ignored.</div><p>` +
    parts.map((p) => (p.kind ? `<s>${esc(p.text)}</s>` : esc(p.text))).join("") + "</p>";
}

async function loadExisting(repo) {
  if (state.sample) return SAMPLE_EXISTING;
  const r = parseRepo(repo);
  if (!r) return [];
  const token = $("token").value.trim();
  try {
    const res = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/issues?state=open&per_page=100`, {
      headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) return [];
    return (await res.json()).filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, url: i.html_url }));
  } catch {
    return [];
  }
}

async function callPlan(extra = {}) {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript: state.transcript, answers: state.answers,
      existing: state.existing.map(({ number, title }) => ({ number, title })), ...extra,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The server answered ${res.status}. Try again.`);
  return data.tickets;
}

function accept(tickets) {
  const source = `${state.transcript}\n${state.answers}`;
  const prev = new Map(state.tickets.map((t) => [t.title, t.approved]));
  state.tickets = tickets.map((t) => {
    const verified = quoteFound(t.quote, source);
    const dup = t.duplicate_of ? state.existing.find((e) => e.number === t.duplicate_of) : null;
    // unverified or duplicate tickets start unticked: the person has to pick them on purpose
    const approved = prev.has(t.title) ? prev.get(t.title) : verified && !dup;
    return { ...t, verified, dup, approved };
  });
  render();
}

function ticketHTML(t, i) {
  const pri = esc(t.priority).toLowerCase();
  const dup = t.dup
    ? `<p class="trace bad">Already exists as ${t.dup.url && t.dup.url !== "#" ? `<a href="${esc(t.dup.url)}" target="_blank" rel="noopener">#${t.dup.number}</a>` : `#${t.dup.number}`} ${esc(t.dup.title)}</p>`
    : "";
  return `
  <article class="stub ticket ${t.approved ? "" : "off"}">
    <div class="stub-l">
      <b>${i + 1}</b>
      <span class="pri ${pri}">${esc(t.priority)}</span>
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

function render() {
  const has = state.tickets.length > 0;
  $("empty").hidden = has;
  $("changebox").hidden = $("step-ship").hidden = !has;
  $("tickets").innerHTML = state.tickets.map(ticketHTML).join("");

  const qs = state.tickets.flatMap((t, i) => t.questions.map((q) => `<li><b>Ticket ${i + 1}:</b> ${esc(q)}</li>`));
  $("ask").hidden = !qs.length;
  $("questions").innerHTML = qs.join("");

  const n = state.tickets.filter((t) => t.approved).length;
  const token = $("token").value.trim();
  $("tokenstate").textContent = token ? "set" : "not set, so this is a dry run";
  $("create").textContent = token ? `Create ${n} issue${n === 1 ? "" : "s"}` : `Preview ${n} issue${n === 1 ? "" : "s"}`;
}

$("tickets").addEventListener("change", (e) => {
  const i = e.target.dataset.i;
  if (i !== undefined) { state.tickets[i].approved = e.target.checked; render(); }
});
$("token").addEventListener("input", render);

$("sample").onclick = () => {
  $("repo").value = SAMPLE_REPO;
  $("transcript").value = SAMPLE;
  showSpeech(SAMPLE);
  $("transcript").focus();
};
$("transcript").addEventListener("input", () => showSpeech($("transcript").value));

$("go").onclick = async () => {
  state.transcript = $("transcript").value.trim();
  state.answers = "";
  state.tickets = [];
  state.sample = $("repo").value.trim() === SAMPLE_REPO;
  if (!state.transcript) return setStatus("status", "Say your plan in the box first.", "err");
  if (!state.sample) try { localStorage.setItem("tt-repo", $("repo").value.trim()); } catch { /* fine */ }
  showSpeech(state.transcript);
  setStatus("status", "Reading what you said and writing tickets…");
  $("go").disabled = true;
  try {
    state.existing = await loadExisting($("repo").value);
    accept(await callPlan());
    const checked = state.existing.length ? `, checked against ${state.existing.length} open issues` : "";
    setStatus("status", `${state.tickets.length} tickets${checked}.`, "ok");
    if (matchMedia("(max-width: 900px)").matches) $("h-tickets").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    setStatus("status", e.message, "err");
  } finally {
    $("go").disabled = false;
  }
};

// ?sample loads the sample and runs it, so a link alone shows the whole flow.
if (new URLSearchParams(location.search).has("sample")) {
  $("sample").onclick();
  $("go").onclick();
}

async function refine(button, extra) {
  button.disabled = true;
  setStatus("status", "Updating the tickets…");
  try {
    accept(await callPlan({ tickets: state.tickets.map(({ verified, dup, approved, ...t }) => t), ...extra }));
    setStatus("status", "Tickets updated.", "ok");
  } catch (e) {
    setStatus("status", e.message, "err");
  } finally {
    button.disabled = false;
  }
}

$("answer").onclick = () => {
  const a = $("answers").value.trim();
  if (!a) return;
  state.answers = [state.answers, a].filter(Boolean).join("\n");
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
  const repo = parseRepo($("repo").value);
  const token = $("token").value.trim();
  const chosen = state.tickets.filter((t) => t.approved);
  if (!repo) return setStatus("shipstatus", "Add the repository at the top first.", "err");
  if (!chosen.length) return setStatus("shipstatus", "Tick at least one ticket.", "err");
  try { $("remember").checked && token ? localStorage.setItem("tt-token", token) : localStorage.removeItem("tt-token"); } catch { /* fine */ }

  if (!token || state.sample) {
    $("created").innerHTML = chosen.map((t) => `<li><b>${esc(t.title)}</b><pre>${esc(issueBody(t))}</pre></li>`).join("");
    const why = state.sample ? "This is the sample project, so nothing is created." : "Add a token to create them for real.";
    return setStatus("shipstatus", `Preview: exactly what would be created. ${why}`, "ok");
  }
  $("create").disabled = true;
  $("created").innerHTML = "";
  let ok = 0;
  for (const t of chosen) {
    setStatus("shipstatus", `Creating ${ok + 1} of ${chosen.length}…`);
    const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/issues`, {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: t.title, body: issueBody(t), labels: t.labels }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      ok++;
      t.approved = false;
      $("created").insertAdjacentHTML("beforeend", `<li>Created <a href="${esc(data.html_url)}" target="_blank" rel="noopener">#${data.number} ${esc(data.title)}</a></li>`);
    } else {
      $("created").insertAdjacentHTML("beforeend", `<li>Not created: ${esc(t.title)}. GitHub said: ${esc(data.message || res.status)}</li>`);
    }
  }
  $("create").disabled = false;
  render();
  setStatus("shipstatus", `Created ${ok} of ${chosen.length}.`, ok === chosen.length ? "ok" : "err");
};
