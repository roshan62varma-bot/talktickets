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
Four modes, plus a hands-free command bar:

### 1. Plan: say what needs doing
- Talk through the plan, rambling and Hinglish included. TalkTickets splits it into separate issues, each with a title, what to do, *done when*, labels, priority and a due date (only if you said one).
- **Questions back:** if something is missing, it asks ("what should the blog be about?"), and you answer by voice.
- **Changes by voice:** *"make ticket 2 a P1"*, *"merge 3 into 1"*.
- **Duplicate check** against the repo's open issues. Duplicates are shown, flagged and left unticked.
- **Steps become a checklist:** say "first the table, then the API, then the UI" and the issue gets a GitHub task list.
- **Assign by voice:** "Rahul can take it" assigns the issue to `@rahul-k`, but only if exactly one person who can be assigned matches. Otherwise it says so.

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

- **Nudges before you talk:** "Last standup you started #6. How did it go?", "#5 has been blocked for 3 days. Still stuck?", "#4 is in progress but untouched for 4 days."
- **Code agrees:** it reads the last 3 days of commits. A commit that mentions the issue, or that the AI matched and that really exists, is shown as proof next to the update. A "done" with no matching commit gets a warning.
- **Checklists tick themselves:** "the table design is done" ticks that line in the issue's task list.
- **Several repos, one standup:** add up to three more repos. Each piece of news goes to the right issue in the right repo.
- **Undo:** every change is recorded with its inverse. One click, or the command "undo", reopens issues, deletes the comments, removes labels and assignees, restores checklists and closes the issues it created.

### 3. Share: post the progress
Pick today, this week or two weeks. TalkTickets reads what actually closed and moved on the repo and writes:
- an **X post**, checked against the 280-character limit, with #NoHandsChallenge
- a **LinkedIn post**
- a **Markdown changelog** (Done / In progress / Blocked)

You can say what to highlight. Open issues are never described as finished. A **progress card** (1200×630, downloadable as SVG or PNG) shows the week's done, moving and blocked counts for your build-in-public post.

### 4. Voice log
Every run in this browser: what you said, the word and filler counts, and every GitHub change, with links. It shows
totals and a typing-time estimate, and you can **download it as Markdown** as proof of work.

### Hands-free command bar
Fixed at the bottom of the page (`Ctrl` + `K`). Hold your Wispr key and say what to do:
- *"switch to standup"*, *"make tickets"*, *"read my issues"*
- *"apply one and three"*, *"apply all"*, *"skip two"*, *"tick 4"* (English or Hindi numbers: *"ek aur teen"*)
- *"answer: the blog is about OfferRoom"*, *"change: make ticket 2 a P1"*
- *"this week"*, *"copy the X post"*, *"undo"*, *"load the sample"*, *"check access"*, *"download the log"*

The whole flow, from talking to approving to posting, works without touching the mouse. Unknown commands are refused with the list of what it understands. It never guesses.

### Also
- **Write it in English or Hinglish.** Your quotes stay exactly as you said them.
- **Sign in with GitHub** (OAuth). It appears when the server has a GitHub OAuth app set up; otherwise paste a fine-grained token.
- **Instant samples.** The sample's AI answers are saved in `lib/samples.js`, so the demo works instantly and never hits the AI quota.

## The truth guard (in every mode)
- Every ticket and update carries the **exact words it came from**, and the browser checks them against what you said. Anything it can't trace is flagged and left unticked.
- Standup updates must point at a **real open issue**.
- Posts are checked so they **only mention issues from that period**.
- Filler words and repeats ("um", "matlab", "the the") are shown struck out and ignored.
- Issue and commit text from GitHub is treated as **data, never instructions**. A link or @mention you didn't say is flagged and never pre-ticked.
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
npm test                                    # 29 tests: commands, truth guard, checklists, nudges, evidence, card, API flows (fake AI), OAuth
node scripts/browser-check.mjs              # 39 checks in a real headless browser, including GitHub writes + undo against a fake GitHub
node scripts/make-samples.js                # refresh the saved sample answers
```

To deploy on Vercel, import the repo and set `GEMINI_API_KEY`. The static files and the `api/` functions work as they are.

**Optional: Sign in with GitHub.** Create a GitHub OAuth app with the callback `https://<your-domain>/api/auth/callback`, then set
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. The button appears by itself.

## Privacy
- What you say is sent to Google's Gemini API to write the tickets, updates and posts. TalkTickets doesn't store it on a server.
- Your GitHub token goes from your browser to GitHub only.
- The voice log and the undo history live in your browser.

## How it's built
- `index.html`, `app.js`, `style.css`: one page, no build step.
- `lib/github.js`: GitHub calls straight from the browser (read issues, create, comment, label, close). The token stays in your browser.
- `lib/text.js`: filler and repeat marking, the quote check, standup action checks, post reference checks, and the issue and comment formats. It is unit-tested.
- `lib/log.js`: the voice log (browser storage) and the Markdown export.
- `lib/commands.js`: the hands-free command parser (English and Hindi numbers). It is unit-tested.
- `lib/work.js`: checklists, commit evidence, nudges, multi-repo refs and the progress card. It is unit-tested.
- `lib/oauth.js` and `api/auth/*`: GitHub sign-in (state cookie, no token in URLs).
- `lib/samples.js`: the made-up sample project and its saved AI answers.
- `api/plan.js`, `api/standup.js`, `api/share.js`: serverless functions that call Gemini with strict JSON schemas and truth rules.
- `lib/gemini.js`: the shared Gemini call, input caps and a per-instance rate limit.

MIT licensed.
