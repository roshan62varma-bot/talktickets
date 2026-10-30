# 🎙️ TalkTickets

**Talk through the work. GitHub keeps up.**

Plan, standup and share by voice. TalkTickets keeps your GitHub issues up to date from what you say, and traces every
change back to your own words. Built by voice with [Wispr Flow](https://wisprflow.ai) for the WeMakeDevs **No Hands**
challenge (Builders track).

## The problem
I'm a student running two or three projects and hackathons at once. Issues are the easy part. Keeping them **up to
date** is where it falls apart: writing "done", "half way", "stuck on X" takes longer than the work, so the board goes
stale and nobody knows what's real. It's the CRM nobody updates, for code.

## What it does
Four modes, one repo:

### 1. Plan: say what needs doing
- Talk through the plan, rambling and Hinglish included. TalkTickets splits it into separate issues, each with a title, what to do, *done when*, labels, priority and a due date (only if you said one).
- **Questions back:** if something is missing, it asks ("what should the blog be about?"), and you answer by voice.
- **Changes by voice:** *"make ticket 2 a P1"*, *"merge 3 into 1"*.
- **Duplicate check** against the repo's open issues. Duplicates are shown, flagged and left unticked.

### 2. Standup: say what happened
Talk like you would to a teammate: what got done, what's half way, what's stuck, what you found. TalkTickets reads your
open issues, matches each piece of news to one, and proposes:

| You say | It does |
|---|---|
| "the login thing got done" | **Done**: closes the issue with a note |
| "the menu is half way" | **Progress**: comments on the issue |
| "ratings are stuck on the database" | **Blocked**: adds a `blocked` label and the reason |
| "today I'll start the Hindi menu" | **Started**: adds an `in-progress` label |
| "found a new bug with time zones" | **New**: creates an issue |

It never closes on a guess. If it's unsure between done and progress, it picks progress, and a low-confidence close starts unticked.

### 3. Share: post the progress
Pick today, this week or two weeks. TalkTickets reads what actually closed and moved on the repo and writes:
- an **X post**, checked against the 280-character limit, with #NoHandsChallenge
- a **LinkedIn post**
- a **Markdown changelog** (Done / In progress / Blocked)

You can say what to highlight. Open issues are never described as finished.

### 4. Voice log
Every run in this browser: what you said, the word and filler counts, and every GitHub change, with links. It shows
totals and a typing-time estimate, and you can **download it as Markdown** as proof of work.

## The truth guard (in every mode)
- Every ticket and update carries the **exact words it came from**, and the browser checks them against what you said. Anything it can't trace is flagged and left unticked.
- Standup updates must point at a **real open issue**.
- Posts are checked so they **only mention issues from that period**.
- Filler words and repeats ("um", "matlab", "the the") are shown struck out and ignored.
- Nothing reaches GitHub until you tick it and press the button. Without a token, everything is a preview.

## Try it
- **Samples** (a made-up hostel mess-menu app; nothing touches GitHub): add `?sample` to the link, optionally with
  `#standup` or `#share`, e.g. `/?sample#standup`. Each tab also has a **Load the sample** button.
- **Your own repo:** paste it at the top, add a fine-grained token (Issues: read and write on that repo), and talk.
- `Ctrl` + `Enter` runs the box you're typing in. Arrow keys switch tabs.

## The result it produced
<!-- Add links to the real issues, standup updates and post TalkTickets made from your voice. -->

## How I used Wispr Flow
<!-- Fill in honestly before submitting: what you dictated, and roughly how much. -->
- Wispr usage card: see the submission.

## Run it
Requires Node 18+ and a free [Gemini API key](https://aistudio.google.com/apikey). No dependencies to install.

```bash
GEMINI_API_KEY=your_key node server.js     # http://localhost:5173
npm test                                    # 11 unit tests: filler marking, truth guard, standup checks, post checks
```

To deploy on Vercel, import the repo and set `GEMINI_API_KEY`. The static files and the three `api/` functions work as they are.

## How it's built
- `index.html`, `app.js`, `style.css`: one page, no build step.
- `lib/github.js`: GitHub calls straight from the browser (read issues, create, comment, label, close). The token stays in your browser.
- `lib/text.js`: filler and repeat marking, the quote check, standup action checks, post reference checks, and the issue and comment formats. It is unit-tested.
- `lib/log.js`: the voice log (browser storage) and the Markdown export.
- `api/plan.js`, `api/standup.js`, `api/share.js`: serverless functions that call Gemini with strict JSON schemas and truth rules.
- `lib/gemini.js`: the shared Gemini call, input caps and a per-instance rate limit.

MIT licensed.
