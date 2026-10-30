// Browser check: drives TalkTickets in a headless Chromium browser over the DevTools protocol and checks every feature,
// including GitHub writes and undo against a fake GitHub (nothing real is touched). Needs the app running on :5173
// with GEMINI_API_KEY set (the live standup and Hinglish plan steps call the real AI).
// Run: BROWSER="path/to/chrome-or-edge" node scripts/browser-check.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "tt-edge-"));
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1360,1000", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr) {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
}
async function go(url) { await send("Page.navigate", { url }); await sleep(1500); }
async function until(expr, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await js(`return Boolean(${expr})`)) return true; await sleep(300); }
  throw new Error(`timed out waiting for: ${expr}`);
}
const cmd = (text) => js(`document.getElementById("cmd-in").value = ${JSON.stringify(text)}; document.getElementById("cmd").requestSubmit(); await new Promise(r => setTimeout(r, 300)); return document.getElementById("cmd-out").textContent;`);

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

try {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  const B = "http://localhost:5173";

  // ---------- PLAN: instant sample, duplicate, steps, assignee ----------
  await go(`${B}/?sample`);
  await until(`document.querySelectorAll("#tickets .ticket").length > 0`, 5000);
  const plan = await js(`return { n: document.querySelectorAll("#tickets .ticket").length, text: document.getElementById("tickets").innerText, status: document.getElementById("status").textContent }`);
  check("plan sample is instant (cached) and makes 4 tickets", plan.n === 4, plan.status);
  check("duplicate is flagged", /Already exists as #14/.test(plan.text));
  check("checklist steps shown", /Design|table/i.test(plan.text) && plan.text.includes("API"));
  check("assignee resolved to a real login", /Assign to @rahul-k/.test(plan.text));

  // ---------- HANDS-FREE commands on plan ----------
  let out = await cmd("skip two");
  const ticks = await js(`return [...document.querySelectorAll("#tickets .pick")].map(c => c.checked)`);
  check("command 'skip two' unticks ticket 2", ticks[1] === false, out);
  out = await cmd("apply one and three");
  await until(`document.querySelectorAll("#created li").length > 0`, 5000);
  const created = await js(`return document.getElementById("created").innerText`);
  check("command 'apply one and three' previews exactly 2", (created.match(/Done when/g) || []).length === 2, out);
  check("preview body has the task list", /- \[ \] /.test(created));
  check("preview shows the assignee", /@rahul-k/.test(created));
  out = await cmd("the weather is nice");
  check("unknown command is refused with help", /didn't catch/.test(out));

  // ---------- STANDUP: nudges, multi-repo, evidence, checklist, assignee ----------
  out = await cmd("switch to standup");
  check("command switches tab", await js(`return !document.getElementById("panel-standup").hidden`), out);
  await until(`!document.getElementById("s-nudges").hidden`, 8000);
  const nud = await js(`return document.getElementById("s-nudges").innerText`);
  check("nudges: last standup's started item", /Last standup you started mess-menu-app#6/.test(nud), nud.replace(/\n/g, " | "));
  check("nudges: blocked and stale in-progress", /blocked for 3 days/.test(nud) && /untouched for 4 days/.test(nud));
  out = await cmd("load the sample");
  await until(`document.querySelectorAll("#s-actions .action").length > 0`, 8000);
  const st = await js(`return { n: document.querySelectorAll("#s-actions .action").length, text: document.getElementById("s-actions").innerText, status: document.getElementById("s-status").textContent }`);
  check("standup sample proposes 6 updates across 2 repos", st.n === 6 && /2 repos/.test(st.status), st.status);
  check("multi-repo ref shown", /mess-admin#2/.test(st.text));
  check("commit evidence shown", /Code agrees: a1b2c3d/.test(st.text));
  check("checklist tick proposed", /Ticks the checklist: Design the ratings table/.test(st.text));
  check("new issue assigned by voice", /Assign to @rahul-k/.test(st.text));
  out = await cmd("apply all");
  await until(`document.querySelectorAll("#s-done li").length > 0`, 5000);
  check("command 'apply all' previews 6", await js(`return document.querySelectorAll("#s-done li").length`) === 6, out);

  // ---------- SHARE: cached posts, checks, card ----------
  await cmd("switch to share");
  out = await cmd("load the sample");
  await until(`document.querySelectorAll("#h-posts .post").length === 3`, 8000);
  const sh = await js(`return { text: document.getElementById("h-posts").innerText, svg: document.querySelector("#h-card svg") ? document.querySelector("#h-card svg").outerHTML.length : 0 }`);
  check("share writes 3 posts instantly", true);
  check("post checks pass", /Every issue it mentions happened/.test(sh.text) && /of 280 characters\./.test(sh.text));
  check("progress card rendered", sh.svg > 500);
  out = await cmd("copy the X post");
  check("command 'copy the X post' runs", /Copied the X post/.test(out), out);

  // ---------- LOG ----------
  await cmd("go to the log");
  const lg = await js(`return document.getElementById("l-totals").innerText + " || " + document.getElementById("l-list").innerText.slice(0, 200)`);
  check("voice log has runs and totals", /runs/.test(lg) && /standup/.test(lg), lg.replace(/\n/g, " ").slice(0, 160));

  // ---------- WRITE PATHS + UNDO against a fake GitHub ----------
  await go(`${B}/#standup`);
  await js(`
    window.__calls = [];
    const real = window.fetch;
    let nextId = 500;
    window.fetch = async (url, opts = {}) => {
      url = String(url);
      if (!url.startsWith("https://api.github.com/")) return real(url, opts);
      const method = opts.method || "GET";
      const path = url.replace("https://api.github.com", "");
      window.__calls.push(method + " " + path + (opts.body ? " " + opts.body : ""));
      const J = (d, s = 200) => new Response(s === 204 ? null : JSON.stringify(d), { status: s });
      if (method === "GET" && path.startsWith("/repos/me/app/issues?")) return J([
        { number: 1, title: "Fix login page on mobile", body: "x", labels: [{ name: "bug" }], state: "open", updated_at: new Date().toISOString(), html_url: "u1" },
        { number: 2, title: "Add meal ratings", body: "Ratings.\\n\\n- [ ] Design the ratings table\\n- [ ] Build the ratings API", labels: [], state: "open", updated_at: new Date().toISOString(), html_url: "u2" }]);
      if (method === "GET" && path.startsWith("/repos/me/app/commits")) return J([{ sha: "abc1234ffff", commit: { message: "fix login on mobile (#1)" }, html_url: "c1" }]);
      if (method === "GET" && path.startsWith("/repos/me/app/assignees")) return J([{ login: "rahul-k" }]);
      if (method === "GET" && path === "/repos/me/app/issues/2") return J({ number: 2, body: "Ratings.\\n\\n- [ ] Design the ratings table\\n- [ ] Build the ratings API" });
      if (method === "POST" && path.endsWith("/comments")) return J({ id: nextId++, html_url: "comment" }, 201);
      if (method === "POST" && path === "/repos/me/app/issues") return J({ number: 9, title: JSON.parse(opts.body).title, html_url: "new" }, 201);
      return J({}, method === "DELETE" ? 204 : 200);
    };
    document.getElementById("repo").value = "me/app";
    document.getElementById("s-more").value = "";
    document.getElementById("token").value = "fake-token";
    document.getElementById("token").dispatchEvent(new Event("input"));
    document.getElementById("s-transcript").value = "Okay so the login page on mobile is done now, finally. For ratings the table design is done but the API is stuck because we have not picked a database. Rahul can take the ratings API.";
    document.getElementById("s-go").click();
  `);
  await until(`document.querySelectorAll("#s-actions .action").length > 0 || /error|Error|busy/.test(document.getElementById("s-status").textContent)`, 40000);
  const live = await js(`return { n: document.querySelectorAll("#s-actions .action").length, text: document.getElementById("s-actions").innerText, status: document.getElementById("s-status").textContent, btn: document.getElementById("s-apply").textContent }`);
  check("live standup (real Gemini) on fake GitHub", live.n >= 2, `${live.status} · ${live.btn}`);
  check("live: evidence from fake commit", /Code agrees: abc1234/.test(live.text));
  await js(`window.confirm = () => true; window.__calls = []; document.getElementById("s-apply").click();`);
  await until(`/Applied/.test(document.getElementById("s-shipstatus").textContent)`, 20000);
  const wrote = await js(`return { calls: window.__calls, status: document.getElementById("s-shipstatus").textContent, undo: document.getElementById("undo").textContent }`);
  console.log("      writes:", wrote.calls.map((c) => c.slice(0, 90)).join("\n              "));
  check("writes: comments posted", wrote.calls.some((c) => /^POST \/repos\/me\/app\/issues\/\d+\/comments/.test(c)), wrote.status);
  check("writes: issue 1 closed", wrote.calls.some((c) => /^PATCH \/repos\/me\/app\/issues\/1 .*"closed"/.test(c)));
  check("writes: checklist ticked in body", wrote.calls.some((c) => /^PATCH \/repos\/me\/app\/issues\/2 .*\[x\] Design the ratings table/.test(c)));
  check("writes: blocked label", wrote.calls.some((c) => /^POST \/repos\/me\/app\/issues\/2\/labels .*blocked/.test(c)));
  check("undo button offered", /Undo: this standup/.test(wrote.undo), wrote.undo);
  await js(`window.__calls = []; document.getElementById("undo").click();`);
  await until(`document.getElementById("undo").hidden`, 20000);
  const undone = await js(`return window.__calls`);
  console.log("      undo:  ", undone.map((c) => c.slice(0, 90)).join("\n              "));
  check("undo: comments deleted", undone.some((c) => /^DELETE \/repos\/me\/app\/issues\/comments\/\d+/.test(c)));
  check("undo: issue reopened", undone.some((c) => /^PATCH \/repos\/me\/app\/issues\/1 .*"open"/.test(c)));
  check("undo: body restored", undone.some((c) => /^PATCH \/repos\/me\/app\/issues\/2 .*\[ \] Design the ratings table/.test(c)));
  check("undo: label removed", undone.some((c) => /^DELETE \/repos\/me\/app\/issues\/2\/labels\/blocked/.test(c)));

  // ---------- PLAN live with Hinglish + create on fake GitHub ----------
  await js(`
    document.getElementById("tab-plan").click();
    document.getElementById("lang").value = "hinglish";
    document.getElementById("transcript").value = "um so mujhe kal tak README update karna hai setup steps ke saath, aur Rahul login bug dekhega";
    window.__calls = [];
    document.getElementById("go").click();`);
  await until(`document.querySelectorAll("#tickets .ticket").length > 0 || /rror|busy/.test(document.getElementById("status").textContent)`, 40000);
  const hp = await js(`return document.getElementById("tickets").innerText.slice(0, 600)`);
  console.log("      hinglish tickets:", hp.replace(/\n/g, " | ").slice(0, 300));
  check("plan live in Hinglish", /karna|hai|ke saath|dekhega|update/i.test(hp));
  check("duplicate of a real open issue starts unticked", await js(`return document.querySelectorAll("#tickets .pick:checked").length`) === 1);
  await js(`window.__calls = []`);
  await cmd("create all");
  await until(`/Created 2/.test(document.getElementById("shipstatus").textContent)`, 20000);
  const pc = await js(`return window.__calls.filter(c => c.startsWith("POST /repos/me/app/issues "))`);
  check("command 'create all' creates both, with the assignee", pc.length === 2 && pc.some((c) => /rahul-k/.test(c)), `${pc.length} created`);
} catch (e) {
  failures++;
  console.log("ERROR", e.message);
} finally {
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  ws?.close();
  edge.kill();
  process.exit(failures ? 1 : 0);
}

