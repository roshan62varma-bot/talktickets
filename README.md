# 🎙️ TalkTickets

**Say your plan out loud. Get clean, verified GitHub issues.**

Built by voice with [Wispr Flow](https://wisprflow.ai) for the WeMakeDevs **No Hands** challenge (Builders track).

## The problem
I'm a student running two or three projects and hackathons at once. The plan for each one lives in my head or in a
chat, because turning it into proper tickets takes longer than doing the work. So nothing gets tracked, and things slip.

## What it does
1. **Talk.** Pick a repo, click the box and talk through what needs doing with Wispr Flow, in any order, rambling and Hinglish included.
2. **Tickets.** TalkTickets splits it into separate GitHub issues: a title, what to do, *done when*, labels, priority and a due date (only if you said one).
   - Filler words and repeats ("um", "matlab", "the the") are shown struck out and ignored.
3. **Truth guard.** Every ticket carries the exact words it came from. The app checks them against what you actually said.
   - Anything it can't trace back is flagged and left unticked, so the AI can't sneak in work you never asked for.
4. **It asks, you answer by voice.** If something is missing ("what should the blog be about?"), it asks, and you answer by talking.
   - Changes work the same way: *"make ticket 2 a P1"*.
5. **Duplicates.** It reads the repo's open issues and flags tickets that already exist.
6. **Ship.** Tick the tickets you want and create them on GitHub with your token, or do a dry run first. Nothing is created until you approve it.

## Try it
- Open the app with `?sample` at the end of the link. It loads a made-up project (a hostel mess-menu app) and runs the whole flow, duplicate check included. Nothing is created on GitHub.
- Or paste your own repo, talk, and press **Make tickets**.

## The result it produced
<!-- Add the link to the real issues TalkTickets created from your spoken plan. -->

## How I used Wispr Flow
<!-- Fill in honestly before submitting: what you dictated, and roughly how much. -->
- Every prompt to my coding agent (Claude Code) while building this was dictated with Wispr Flow.
- The plan the app turned into issues was dictated, and so were the answers to its questions.
- Wispr usage card: see the submission.

## Run it
Requires Node 18+ and a free [Gemini API key](https://aistudio.google.com/apikey).

```bash
GEMINI_API_KEY=your_key node server.js     # http://localhost:5173
npm test                                    # unit tests for the filler marking and the truth guard
```

To deploy on Vercel, import the repo and set `GEMINI_API_KEY`. The static files and `api/plan.js` work as they are.

## How it's built
- `index.html`, `app.js`, `style.css`: a single page with no build step. It talks to GitHub directly from the browser,
  and the token stays in your browser.
- `api/plan.js`: one serverless function that calls Gemini with a strict JSON schema and truth rules.
- `lib/text.js`: filler and repeat marking, the quote check (the truth guard), and the issue body format. It is unit-tested.

MIT licensed.
