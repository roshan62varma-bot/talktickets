// POST /api/plan: turn a spoken plan into GitHub-ready tickets.
// Body: { transcript, answers?, tickets?, instruction?, existing?: [{number, title}] }
// - First pass: transcript (+ existing issue titles for duplicate checks).
// - Refine pass: also the current tickets plus answers to questions or a spoken change request.
import { HttpError, SPOKEN, gemini, handler, issueList, requireSpeech, str } from "../lib/gemini.js";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    tickets: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          body: { type: "STRING" },
          done_when: { type: "STRING" },
          labels: { type: "ARRAY", items: { type: "STRING" } },
          priority: { type: "STRING", enum: ["P1", "P2", "P3"] },
          due: { type: "STRING" },
          quote: { type: "STRING" },
          questions: { type: "ARRAY", items: { type: "STRING" } },
          duplicate_of: { type: "INTEGER" },
        },
        required: ["title", "body", "done_when", "labels", "priority", "due", "quote", "questions"],
      },
    },
  },
  required: ["tickets"],
};

const RULES = `You turn a person's spoken plan into GitHub issues. ${SPOKEN}

Rules:
- One ticket per separate piece of work. Merge repeats of the same task. Skip pure chit-chat.
- Write titles and bodies in clear, short English, starting titles with a verb ("Add…", "Fix…", "Record…").
- TRUTH: use only what the person said (and their answers). Never invent tools, numbers, names, dates or steps.
- "quote": copy a short phrase (4-12 words) EXACTLY as it appears in the transcript or answers that this ticket comes from.
  Do not translate or fix it. It is used to verify the ticket.
- "due": only if the person said a date or deadline that applies to this task; otherwise "". Write it the way they
  said it, translated to English ("November 7, night", "Friday", "kal tak" → "by tomorrow"). Never add a year, weekday or time they didn't say.
- "done_when": one line describing how we know it's finished, based on what they said. If they didn't make it clear,
  write your best plain reading of their words AND add a question.
- "questions": ask about anything missing that you would otherwise have to guess (what exactly, how big, by when).
  Ask at most 2 per ticket, in simple English. Empty if the ticket is clear.
- "labels": 1-2 short lowercase labels from what the task is about (e.g. "docs", "bug", "demo", "setup").
- "priority": P1 if they said it's first/urgent/blocking, P3 if "later/maybe/nice to have", else P2.
- "duplicate_of": if an EXISTING issue (given below) is clearly the same task, its number; otherwise omit it.
  Still return that ticket (the person decides); never drop a task because it already exists.`;

export async function plan(input) {
  const transcript = requireSpeech(input?.transcript);
  const answers = str(input?.answers, 4000);
  const instruction = str(input?.instruction, 500);
  const tickets = Array.isArray(input?.tickets) ? input.tickets.slice(0, 25) : [];
  if (JSON.stringify(tickets).length > 20000) throw new HttpError(400, "Too many tickets at once");
  const existing = issueList(input?.existing);

  let p = `${RULES}\n\nTRANSCRIPT (spoken plan):\n"""\n${transcript}\n"""\n`;
  if (answers) p += `\nANSWERS the person gave to your earlier questions (also spoken):\n"""\n${answers}\n"""\n`;
  if (existing.length) p += `\nEXISTING open issues in the repo:\n${existing.map((i) => `#${i.number} ${i.title}`).join("\n")}\n`;
  if (tickets.length) {
    p += `\nCURRENT tickets (JSON):\n${JSON.stringify(tickets)}\n`;
    p += instruction
      ? `\nThe person asked for this change (spoken): "${instruction}"\nApply it. Keep every other ticket as it is.\n`
      : `\nUpdate the current tickets using the answers. Drop questions that are now answered.\n`;
  }
  const out = await gemini(`${p}\nReturn JSON only.`, SCHEMA);
  return { tickets: Array.isArray(out.tickets) ? out.tickets : [] };
}

export default handler(plan);
