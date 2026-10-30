import { issueBody, markSpeech, parseRepo, quoteFound } from "./lib/text.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SAMPLE_REPO = "roshan62varma-bot/offerroom";
const SAMPLE = `Okay so, um, for the Flip the Switch hackathon, first thing on November 4th I need to make a template yaml file so Switch Console can create all five agents and the room by itself. Then, uh, I have to record the demo again, the the whole flow, and this time add the mock interview where I answer by voice with Wispr. Basically the old video shows 29 October so it has to be redone. Matlab, also the README should honestly say the engine was built before the hackathon and the Switch setup was built during it. And maybe later, if time, add my CGPA to the resume. All of this before 7 November night.`;

const state = { tickets: [], existing: [], transcript: "", answers: "" };

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
  el.innerHTML = `<div class="step small">What we heard · ${fillers} filler${fillers === 1 ? "" : "s"}, ${repeats} repeat${repeats === 1 ? "" : "s"} ignored</div><p>` +
    parts.map((p) => (p.kind ? `<s class="${p.kind}">${esc(p.text)}</s>` : esc(p.text))).join("") + "</p>";
}

async function loadExisting(repo) {
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
    body: JSON.stringify({ transcript: state.transcript, answers: state.answers, existing: state.existing, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data.tickets;
}

function accept(tickets) {
  const source = `${state.transcript}\n${state.answers}`;
  const prev = new Map(state.tickets.map((t) => [t.title, t.approved]));
  state.tickets = tickets.map((t) => {
    const verified = quoteFound(t.quote, source);
    const dup = t.duplicate_of ? state.existing.find((e) => e.number === t.duplicate_of) : null;
    // unverified or duplicate tickets start unticked: the person has to choose them on purpose
    const approved = prev.has(t.title) ? prev.get(t.title) : verified && !dup;
    return { ...t, verified, dup, approved };
  });
  render();
}

function render() {
  $("step-review").hidden = $("step-ship").hidden = !state.tickets.length;
  $("tickets").innerHTML = state.tickets.map((t, i) => `
    <article class="ticket ${t.approved ? "" : "off"}">
      <div class="thead">
        <label class="check"><input type="checkbox" data-i="${i}" ${t.approved ? "checked" : ""}> <b>${i + 1}. ${esc(t.title)}</b></label>
        <span class="pill ${t.priority.toLowerCase()}">${esc(t.priority)}</span>
      </div>
      <p>${esc(t.body)}</p>
      <div class="meta">
        <span><b>Done when:</b> ${esc(t.done_when)}</span>
        ${t.due ? `<span><b>Due:</b> ${esc(t.due)}</span>` : ""}
        ${t.labels.map((l) => `<span class="label">${esc(l)}</span>`).join("")}
      </div>
      <div class="guard ${t.verified ? "ok" : "bad"}">
        ${t.verified ? "✓ From what you said:" : "⚠ Couldn't find this in what you said:"} “${esc(t.quote)}”
      </div>
      ${t.dup ? `<div class="guard bad">⚠ Looks like a duplicate of <a href="${esc(t.dup.url)}" target="_blank" rel="noopener">#${t.dup.number} ${esc(t.dup.title)}</a></div>` : ""}
    </article>`).join("");

  const qs = state.tickets.flatMap((t, i) => t.questions.map((q) => `<li><b>Ticket ${i + 1}:</b> ${esc(q)}</li>`));
  $("ask").hidden = !qs.length;
  $("questions").innerHTML = qs.join("");
  const n = state.tickets.filter((t) => t.approved).length;
  $("create").textContent = $("token").value.trim() ? `Create ${n} issue${n === 1 ? "" : "s"}` : `Dry run: ${n} issue${n === 1 ? "" : "s"}`;
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
};
$("transcript").addEventListener("input", () => showSpeech($("transcript").value));

$("go").onclick = async () => {
  state.transcript = $("transcript").value.trim();
  state.answers = "";
  state.tickets = [];
  if (!state.transcript) return setStatus("status", "Say your plan first.", "err");
  try { localStorage.setItem("tt-repo", $("repo").value.trim()); } catch { /* fine */ }
  showSpeech(state.transcript);
  setStatus("status", "Listening back and writing tickets…");
  $("go").disabled = true;
  try {
    state.existing = await loadExisting($("repo").value);
    accept(await callPlan());
    setStatus("status", `${state.tickets.length} tickets` + (state.existing.length ? `, checked against ${state.existing.length} open issues` : ""), "ok");
    $("step-review").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    setStatus("status", e.message, "err");
  } finally {
    $("go").disabled = false;
  }
};

async function refine(button, extra) {
  button.disabled = true;
  setStatus("status", "Updating tickets…");
  try {
    accept(await callPlan({ tickets: state.tickets.map(({ verified, dup, approved, ...t }) => t), ...extra }));
    setStatus("status", "Tickets updated", "ok");
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
  if (!repo) return setStatus("shipstatus", "Add the repo at the top first.", "err");
  if (!chosen.length) return setStatus("shipstatus", "Tick at least one ticket.", "err");
  try { $("remember").checked && token ? localStorage.setItem("tt-token", token) : localStorage.removeItem("tt-token"); } catch { /* fine */ }

  if (!token) {
    $("created").innerHTML = chosen.map((t) => `<li><b>${esc(t.title)}</b><pre>${esc(issueBody(t))}</pre></li>`).join("");
    return setStatus("shipstatus", "Dry run: this is exactly what would be created. Add a token to create them.", "ok");
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
      $("created").insertAdjacentHTML("beforeend", `<li>✅ <a href="${esc(data.html_url)}" target="_blank" rel="noopener">#${data.number} ${esc(data.title)}</a></li>`);
    } else {
      $("created").insertAdjacentHTML("beforeend", `<li>❌ ${esc(t.title)}: ${esc(data.message || res.status)}</li>`);
    }
  }
  $("create").disabled = false;
  render();
  setStatus("shipstatus", `${ok} of ${chosen.length} created`, ok === chosen.length ? "ok" : "err");
};
