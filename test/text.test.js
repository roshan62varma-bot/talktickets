import { test } from "node:test";
import assert from "node:assert/strict";
import { issueBody, markSpeech, parseRepo, quoteFound } from "../lib/text.js";

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
