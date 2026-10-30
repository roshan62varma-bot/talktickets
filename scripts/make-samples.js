// Runs each sample through the real AI once and saves the answers into lib/samples.js,
// so the samples in the app are instant and never depend on the AI quota.
// Run: GEMINI_API_KEY=... node scripts/make-samples.js
import { readFile, writeFile } from "node:fs/promises";
import { plan } from "../api/plan.js";
import { standup } from "../api/standup.js";
import { share } from "../api/share.js";
import * as S from "../lib/samples.js";
import { standupPayload } from "../lib/work.js";

const repos = [S.SAMPLE_REPO, S.SAMPLE_REPO_2];
const cached = {
  plan: await plan({ transcript: S.PLAN, existing: S.EXISTING, lang: "en" }),
  standup: await standup({ transcript: S.STANDUP, lang: "en", ...standupPayload(repos, S.openIssues(), S.COMMITS) }),
  share: await share({ repo: "a hostel mess-menu app", days: 7, closed: S.ACTIVITY.closed, active: S.ACTIVITY.active }),
};
const file = new URL("../lib/samples.js", import.meta.url);
const src = await readFile(file, "utf8");
await writeFile(file, src.replace(/export const CACHED = [\s\S]*$/, `export const CACHED = ${JSON.stringify(cached, null, 2)};\n`));
console.log("plan", cached.plan.tickets.length, "tickets · standup", cached.standup.actions.length, "actions · share ok");
for (const t of cached.plan.tickets) console.log(" P", t.priority, t.title, "| steps", t.steps?.length || 0, "| who", t.assignee || "-", "| dup", t.duplicate_of || "-");
for (const a of cached.standup.actions) console.log(" S", a.type, a.ref || a.repo, "|", a.note, "| steps", JSON.stringify(a.steps_done || []), "| who", a.assignee || "-", "| ev", JSON.stringify(a.evidence || []));
console.log(" X:", cached.share.x_post);
