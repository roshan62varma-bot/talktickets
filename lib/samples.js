// The sample: a made-up hostel mess-menu app. No real repository is read or written.
// Each sample's AI answer is saved below, so samples run instantly and never hit the AI quota.
// Regenerate with: node scripts/make-samples.js

export const SAMPLE_REPO = "sample/mess-menu-app";
export const SAMPLE_REPO_2 = "sample/mess-admin";

export const PLAN = `Okay so, um, the mess menu app. First thing, the login page is broken on mobile, the the button gets cut off, that has to be fixed by Friday. Then, uh, students keep asking what's for dinner, so we need today's menu right on the home screen. Basically also a way to rate each meal, like one to five stars, first the table design, then the API, then the stars on the meal screen, matlab so the mess committee sees what people hate. Rahul can take the ratings. And maybe later, if there's time, Hindi and Tamil versions of the menu.`;

export const EXISTING = [
  { number: 14, title: "Show today's menu on the home screen", url: "" },
  { number: 9, title: "Add dark mode", url: "" },
];

export const ASSIGNEES = ["rahul-k", "roshan-dev", "priya-s"];

const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();

/** Open issues across the two sample repos, as the standup sees them. */
export function openIssues() {
  return [
    { repo: SAMPLE_REPO, number: 3, title: "Fix login button cut off on mobile", body: "The login button is cut off on small screens.", labels: ["bug"], updated_at: ago(1), url: "" },
    { repo: SAMPLE_REPO, number: 4, title: "Show today's menu on the home screen", body: "Students keep asking what's for dinner.", labels: ["feature", "in-progress"], updated_at: ago(4), url: "" },
    { repo: SAMPLE_REPO, number: 5, title: "Add 1-5 star meal ratings", body: "So the mess committee sees which meals people dislike.\n\n- [ ] Design the ratings table\n- [ ] Build the ratings API\n- [ ] Show stars on the meal screen", labels: ["feature", "blocked"], updated_at: ago(3), url: "" },
    { repo: SAMPLE_REPO, number: 6, title: "Hindi and Tamil versions of the menu", body: "Later, if there's time.", labels: ["i18n"], updated_at: ago(2), url: "" },
    { repo: SAMPLE_REPO_2, number: 2, title: "Export the weekly menu as a PDF for the notice board", body: "The warden prints it every Monday.", labels: ["feature"], updated_at: ago(2), url: "" },
  ];
}

export const COMMITS = [
  { repo: SAMPLE_REPO, sha: "a1b2c3d4e5f6", message: "Fix login button overflow on small screens (#3)", url: "" },
  { repo: SAMPLE_REPO, sha: "9f8e7d6c5b4a", message: "Add /menu/today endpoint", url: "" },
  { repo: SAMPLE_REPO, sha: "4c5d6e7f8a9b", message: "Draft ratings table schema", url: "" },
  { repo: SAMPLE_REPO_2, sha: "7a6b5c4d3e2f", message: "Generate weekly menu PDF", url: "" },
];

/** The last standup in the sample's voice log, so the nudges have something to remember. */
export const LAST_STANDUP = { mode: "standup", actions: [{ type: "started", ref: "mess-menu-app#6" }] };

export const STANDUP = `Okay so, um, yesterday the login thing got done, the button fits on mobile now. The home screen menu is half way, the API gives today's menu but the UI isn't built yet. For ratings, the table design is done, but the API is stuck, matlab we still have to decide which database to use. On the admin side, the menu PDF for the notice board is done too, the warden printed it today. Oh and I found a new bug, the menu dates show in the wrong time zone at night, Rahul can look at that. Today I'll start on the Hindi menu.`;

/** What happened this week in the sample, for Share. */
export const ACTIVITY = {
  closed: [
    { number: 3, title: "Fix login button cut off on mobile", labels: ["bug"] },
    { number: 2, title: "Export the weekly menu as a PDF for the notice board", labels: ["feature"] },
  ],
  active: [
    { number: 4, title: "Show today's menu on the home screen", labels: ["feature", "in-progress"] },
    { number: 5, title: "Add 1-5 star meal ratings", labels: ["feature", "blocked"] },
    { number: 6, title: "Hindi and Tamil versions of the menu", labels: ["i18n", "in-progress"] },
    { number: 7, title: "Menu dates show in the wrong time zone", labels: ["bug"] },
  ],
};

// ---- saved AI answers (filled in by scripts/make-samples.js) ----
export const CACHED = {
  "plan": {
    "tickets": [
      {
        "title": "Fix login page on mobile",
        "body": "The login page is broken on mobile because the button gets cut off.",
        "done_when": "The login button is no longer cut off on mobile devices.",
        "labels": [
          "bug",
          "mobile"
        ],
        "priority": "P2",
        "due": "Friday",
        "quote": "the login page is broken on mobile, the the button gets cut off",
        "questions": []
      },
      {
        "title": "Show today's menu on the home screen",
        "body": "Students keep asking what's for dinner, so we need today's menu right on the home screen.",
        "done_when": "Today's menu is displayed on the home screen.",
        "labels": [
          "feature",
          "ui"
        ],
        "priority": "P2",
        "due": "",
        "quote": "students keep asking what's for dinner, so we need today's menu",
        "questions": [],
        "duplicate_of": 14
      },
      {
        "title": "Add meal rating system",
        "body": "Add a way to rate each meal from one to five stars so the mess committee sees what people hate.",
        "done_when": "Users can rate each meal from one to five stars and the mess committee can view the ratings.",
        "labels": [
          "feature",
          "ratings"
        ],
        "priority": "P2",
        "due": "",
        "quote": "a way to rate each meal, like one to five stars",
        "questions": [],
        "assignee": "Rahul",
        "steps": [
          "Table design",
          "API",
          "Stars on the meal screen"
        ]
      },
      {
        "title": "Add Hindi and Tamil versions of the menu",
        "body": "Add Hindi and Tamil language support for the menu if there is time later.",
        "done_when": "Hindi and Tamil versions of the menu are available.",
        "labels": [
          "i18n",
          "localization"
        ],
        "priority": "P3",
        "due": "",
        "quote": "Hindi and Tamil versions of the menu",
        "questions": []
      }
    ]
  },
  "standup": {
    "actions": [
      {
        "type": "done",
        "ref": "A#3",
        "note": "Fixed login button overflow on mobile screens.",
        "quote": "yesterday the login thing got done, the button fits on mobile now",
        "confidence": "high",
        "assignee": "",
        "evidence": [
          "a1b2c3d"
        ],
        "labels": [],
        "repo": "A",
        "steps_done": [],
        "title": ""
      },
      {
        "type": "progress",
        "ref": "A#4",
        "note": "Working on the home screen menu, API gives today's menu but the UI is not built yet.",
        "quote": "The home screen menu is half way, the API gives today's menu but the UI isn't built yet",
        "confidence": "high",
        "assignee": "",
        "evidence": [
          "9f8e7d6"
        ],
        "labels": [],
        "repo": "A",
        "steps_done": [],
        "title": ""
      },
      {
        "type": "blocked",
        "ref": "A#5",
        "note": "The table design is done, but the API is stuck because we still have to decide which database to use.",
        "quote": "For ratings, the table design is done, but the API is stuck, matlab we still have to decide which database to use",
        "confidence": "high",
        "assignee": "",
        "evidence": [
          "4c5d6e7"
        ],
        "labels": [],
        "repo": "A",
        "steps_done": [
          "Design the ratings table"
        ],
        "title": ""
      },
      {
        "type": "done",
        "ref": "B#2",
        "note": "Finished exporting the weekly menu as a PDF for the notice board.",
        "quote": "the menu PDF for the notice board is done too, the warden printed it today",
        "confidence": "high",
        "assignee": "",
        "evidence": [
          "7a6b5c4"
        ],
        "labels": [],
        "repo": "B",
        "steps_done": [],
        "title": ""
      },
      {
        "type": "new",
        "ref": "",
        "note": "The menu dates show in the wrong time zone at night.",
        "quote": "the menu dates show in the wrong time zone at night",
        "confidence": "high",
        "assignee": "Rahul",
        "evidence": [],
        "labels": [
          "bug",
          "i18n"
        ],
        "repo": "A",
        "steps_done": [],
        "title": "Menu dates show in the wrong time zone at night"
      },
      {
        "type": "started",
        "ref": "A#6",
        "note": "Starting on the Hindi menu version.",
        "quote": "Today I'll start on the Hindi menu",
        "confidence": "high",
        "assignee": "",
        "evidence": [],
        "labels": [],
        "repo": "A",
        "steps_done": [],
        "title": ""
      }
    ],
    "summary": "Login button and PDF export are done, home screen menu and ratings are in progress with ratings blocked on database choice, and a new time zone bug was found."
  },
  "share": {
    "x_post": "Fixed login button cut off on mobile in #3 and added PDF export for the weekly menu in #2. Working on home screen menu and translations. #NoHandsChallenge",
    "linkedin_post": "Here is the weekly update for the hostel mess-menu app. We made progress on fixing bugs and adding new export options for residents.\n\n- Fixed the login button cut off on mobile (#3)\n- Added weekly menu PDF export for the notice board (#2)\n\nNext, I am working on showing today's menu on the home screen and adding Hindi and Tamil versions, though meal ratings are currently blocked. #NoHandsChallenge",
    "changelog": "### Done\n- #3 Fix login button cut off on mobile\n- #2 Export the weekly menu as a PDF for the notice board\n### In progress\n- #4 Show today's menu on the home screen\n- #6 Hindi and Tamil versions of the menu\n- #7 Menu dates show in the wrong time zone\n### Blocked\n- #5 Add 1-5 star meal ratings"
  }
};
