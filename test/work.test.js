import { test } from "node:test";
import assert from "node:assert/strict";
import { numbersIn, parseCommand } from "../lib/commands.js";
import { evidenceFor, nudges, parseSteps, progressCard, sameStep, tickSteps } from "../lib/work.js";
import { issueBody } from "../lib/text.js";

// ---------- hands-free commands ----------
test("numbers: digits, #refs, English and Hindi words, ranges", () => {
  assert.deepEqual(numbersIn("apply one and three"), [1, 3]);
  assert.deepEqual(numbersIn("skip #2 and 4"), [2, 4]);
  assert.deepEqual(numbersIn("ek aur teen apply karo"), [1, 3]);
  assert.deepEqual(numbersIn("tick 2 to 4"), [2, 3, 4]);
});

test("commands: the everyday ones", () => {
  assert.deepEqual(parseCommand("Um, switch to standup please"), { action: "tab", tab: "standup" });
  assert.deepEqual(parseCommand("go to the voice log"), { action: "tab", tab: "log" });
  assert.deepEqual(parseCommand("make tickets"), { action: "run" });
  assert.deepEqual(parseCommand("read my issues"), { action: "run" });
  assert.deepEqual(parseCommand("Apply one and three."), { action: "apply", numbers: [1, 3] });
  assert.deepEqual(parseCommand("create all of them"), { action: "apply", all: true });
  assert.deepEqual(parseCommand("apply"), { action: "apply" });
  assert.deepEqual(parseCommand("skip two"), { action: "untick", numbers: [2] });
  assert.deepEqual(parseCommand("tick 4"), { action: "tick", numbers: [4] });
  assert.deepEqual(parseCommand("undo that"), { action: "undo" });
  assert.deepEqual(parseCommand("copy the X post"), { action: "copy", target: "x" });
  assert.deepEqual(parseCommand("copy linkedin"), { action: "copy", target: "linkedin" });
  assert.deepEqual(parseCommand("this week"), { action: "period", days: 7 });
  assert.deepEqual(parseCommand("load the sample"), { action: "sample" });
  assert.deepEqual(parseCommand("check access"), { action: "access" });
  assert.deepEqual(parseCommand("download the log"), { action: "export" });
});

test("commands: answers and changes keep their words", () => {
  assert.deepEqual(parseCommand("Answer: the blog is about OfferRoom, by Friday"), { action: "answer", text: "the blog is about OfferRoom, by Friday" });
  assert.deepEqual(parseCommand("change make ticket 2 a P1"), { action: "change", text: "make ticket 2 a P1" });
});

test("commands: nonsense is unknown, not a guess", () => {
  assert.deepEqual(parseCommand("the weather is nice"), { action: "unknown" });
  assert.deepEqual(parseCommand(""), { action: "unknown" });
});

// ---------- assign by voice ----------
test("spoken names match one assignable login, or none", async () => {
  const { matchLogin } = await import("../lib/github.js");
  const logins = ["rahul-k", "roshan62varma-bot", "priya"];
  assert.equal(matchLogin("Rahul", logins), "rahul-k");
  assert.equal(matchLogin("@priya", logins), "priya");
  assert.equal(matchLogin("Amit", logins), null);
  assert.equal(matchLogin("r", logins), null); // too short to be sure
  assert.equal(matchLogin("ro", ["roshan", "rohit"]), null); // two matches: don't guess
});

// ---------- checklists ----------
const BODY = "Ratings.\n\n- [ ] Design the ratings table\n- [ ] Build the ratings API\n- [x] Pick the star icons\n";

test("checklist steps are read from the body", () => {
  assert.deepEqual(parseSteps(BODY), [
    { text: "Design the ratings table", done: false },
    { text: "Build the ratings API", done: false },
    { text: "Pick the star icons", done: true },
  ]);
});

test("spoken step names tick the matching lines only", () => {
  assert.ok(sameStep("the table design for ratings", "Design the ratings table"));
  assert.ok(!sameStep("ratings API", "Design the ratings table"));
  const { body, ticked } = tickSteps(BODY, ["ratings table design"]);
  assert.deepEqual(ticked, ["Design the ratings table"]);
  assert.match(body, /- \[x\] Design the ratings table/);
  assert.match(body, /- \[ \] Build the ratings API/);
});

test("issue body lists the steps as a task list", () => {
  const b = issueBody({ body: "Ratings.", steps: ["Design the table", "Build the API"], done_when: "x", priority: "P2", quote: "q" });
  assert.match(b, /- \[ \] Design the table\n- \[ \] Build the API/);
});

// ---------- commit evidence ----------
test("evidence: commits that mention the issue or that the AI picked and really exist", () => {
  const commits = [{ sha: "a1b2c3d4", message: "Fix login button overflow (#3)" }, { sha: "9f8e7d6c", message: "Add /menu/today endpoint" }];
  assert.deepEqual(evidenceFor({ evidence: [] }, commits, 3).map((c) => c.sha), ["a1b2c3d4"]);
  assert.deepEqual(evidenceFor({ evidence: ["9f8e7d6"] }, commits, 4).map((c) => c.sha), ["9f8e7d6c"]);
  assert.deepEqual(evidenceFor({ evidence: ["deadbee"] }, commits, 9), []); // made-up sha is dropped
});

// ---------- nudges ----------
test("nudges: last standup's started items, long blocks, stale in-progress", () => {
  const now = Date.parse("2026-10-31T10:00:00Z");
  const open = [
    { ref: "#5", title: "Ratings", labels: ["blocked"], updated_at: "2026-10-27T10:00:00Z" },
    { ref: "#6", title: "Hindi menu", labels: ["in-progress"], updated_at: "2026-10-30T10:00:00Z" },
    { ref: "#4", title: "Home menu", labels: ["in-progress"], updated_at: "2026-10-26T10:00:00Z" },
    { ref: "#8", title: "Fresh", labels: [], updated_at: "2026-10-31T09:00:00Z" },
  ];
  const log = [{ mode: "standup", actions: [{ type: "started", ref: "#6" }] }];
  const n = nudges(open, log, now);
  assert.deepEqual(n.map((x) => x.ref), ["#6", "#5", "#4"]);
  assert.match(n[1].text, /blocked for 4 days/);
  assert.match(n[2].text, /untouched for 5 days/);
});

// ---------- progress card ----------
test("progress card counts and escapes", () => {
  const svg = progressCard({ project: "mess <app>", days: 7, closed: [{ number: 3, title: "Fix & ship" }], active: [{ labels: ["blocked"] }, { labels: [] }] });
  assert.match(svg, /^<svg/);
  assert.match(svg, /mess &lt;app&gt;/);
  assert.match(svg, /#3 Fix &amp; ship/);
  assert.match(svg, />1<\/text><text y="46" font-size="26" fill="#4a5470">done/);
  assert.match(svg, /this week/);
});
