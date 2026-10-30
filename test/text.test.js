import { test } from "node:test";
import assert from "node:assert/strict";
import { actionComment, checkAction, issueBody, issueRefs, markSpeech, minutesSaved, parseRepo, quoteFound, unknownRefs, wordCount } from "../lib/text.js";

test("standup actions: verified quote and a real open issue get ticked", () => {
  const said = "login wala fix ho gaya, menu pe aadha kaam hua";
  const a = { type: "done", issue: 3, quote: "login wala fix ho gaya", confidence: "high" };
  assert.deepEqual(checkAction(a, [3, 4], said), { verified: true, knownIssue: true, tick: true });
});

test("standup actions: unknown issue, unsaid quote or a low-confidence close stay unticked", () => {
  const said = "login wala fix ho gaya, menu pe aadha kaam hua";
  assert.equal(checkAction({ type: "progress", issue: 99, quote: "menu pe aadha kaam hua", confidence: "high" }, [3], said).tick, false);
  assert.equal(checkAction({ type: "progress", issue: 3, quote: "deployed to production servers", confidence: "high" }, [3], said).tick, false);
  assert.equal(checkAction({ type: "done", issue: 3, quote: "login wala fix ho gaya", confidence: "low" }, [3], said).tick, false);
  assert.equal(checkAction({ type: "new", issue: 0, quote: "menu pe aadha kaam hua", confidence: "high" }, [], said).tick, true);
});

test("action comment carries the type, the note and the quote", () => {
  const c = actionComment({ type: "blocked", note: "Waiting on the database choice.", quote: "database decide nahi hua" });
  assert.match(c, /^\*\*Blocked:\*\* Waiting on the database choice\./);
  assert.match(c, /From the standup: "database decide nahi hua"/);
});

test("posts: issue references are found and unknown ones flagged", () => {
  assert.deepEqual(issueRefs("Closed #3 and #12, then #3 again"), [3, 12]);
  assert.deepEqual(unknownRefs("Shipped #3 and #40", [3, 4]), [40]);
});

test("word count and the typing estimate", () => {
  assert.equal(wordCount("  one two\nthree "), 3);
  assert.ok(Math.abs(minutesSaved(150) - 2.75) < 1e-9); // 150 words: 3.75 min typing - 1 min speaking
  assert.equal(minutesSaved(0), 0);
});

test("fillers and repeats are marked, real words kept", () => {
  const { parts, fillers, repeats } = markSpeech("Okay so, um, record the the demo, matlab today");
  assert.equal(fillers, 3); // okay so, um, matlab
  assert.equal(repeats, 1);
  const kept = parts.filter((p) => !p.kind).map((p) => p.text).join("");
  assert.match(kept, /record the demo/);
});

test("truth guard accepts exact and lightly reworded quotes", () => {
  const said = "Then, uh, I have to record the demo again, the the whole flow.";
  assert.ok(quoteFound("I have to record the demo again", said));
  assert.ok(quoteFound("I have to record demo again", said)); // one word dropped
});

test("truth guard rejects things that were never said", () => {
  const said = "Then I have to record the demo again.";
  assert.equal(quoteFound("deploy the app to Kubernetes", said), false);
  assert.equal(quoteFound("", said), false);
  assert.equal(quoteFound("demo", said), false); // one word proves nothing, even if it was said
});

test("short exact quote still verifies", () => {
  assert.ok(quoteFound("record the demo", "please record the demo"));
});

test("repo parsing", () => {
  assert.deepEqual(parseRepo("roshan62varma-bot/offerroom"), { owner: "roshan62varma-bot", repo: "offerroom" });
  assert.deepEqual(parseRepo("https://github.com/roshan62varma-bot/offerroom.git"), { owner: "roshan62varma-bot", repo: "offerroom" });
  assert.equal(parseRepo("nonsense"), null);
});

test("issue body carries done-when, due, priority and the source quote", () => {
  const body = issueBody({ body: "Make the template.", done_when: "Console creates agents", due: "Nov 7", priority: "P1", quote: "make a template yaml" });
  assert.match(body, /Done when:\*\* Console creates agents/);
  assert.match(body, /Due:\*\* Nov 7/);
  assert.match(body, /From the voice note: "make a template yaml"/);
});
