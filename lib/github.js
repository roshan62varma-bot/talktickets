// Browser-side GitHub calls. The token goes straight from the browser to api.github.com.
import { parseRepo } from "./text.js";

async function gh(repo, path, { token, method = "GET", body } = {}) {
  const r = parseRepo(repo);
  if (!r) throw new Error("Add the repository at the top first (owner/repo).");
  const res = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = res.status === 404 ? "not found, or the token can't see it" : data.message || res.status;
    throw new Error(`GitHub: ${why}`);
  }
  return data;
}

const plain = (i) => ({
  number: i.number,
  title: i.title,
  body: (i.body || "").slice(0, 300),
  labels: (i.labels || []).map((l) => (typeof l === "string" ? l : l.name)),
  state: i.state,
  closed_at: i.closed_at || "",
  updated_at: i.updated_at,
  url: i.html_url,
});
const issuesOnly = (list) => list.filter((i) => !i.pull_request).map(plain);

export const openIssues = async (repo, token) => issuesOnly(await gh(repo, "/issues?state=open&per_page=100", { token }));

/** Issues closed, and open issues touched, since `days` ago. */
export async function activity(repo, token, days) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const all = issuesOnly(await gh(repo, `/issues?state=all&since=${since}&per_page=100`, { token }));
  return {
    closed: all.filter((i) => i.state === "closed" && i.closed_at >= since),
    active: all.filter((i) => i.state === "open"),
  };
}

/** Can this token write issues here? Returns a sentence for the UI. */
export async function checkAccess(repo, token) {
  const info = await gh(repo, "", { token });
  if (!token) return { ok: false, text: `${info.full_name} found. Add a token to make changes.` };
  return info.permissions?.push || info.permissions?.triage
    ? { ok: true, text: `Token can update issues in ${info.full_name}.` }
    : { ok: false, text: `This token can read ${info.full_name} but can't change its issues.` };
}

export const createIssue = (repo, token, t) =>
  gh(repo, "/issues", { token, method: "POST", body: { title: t.title, body: t.body, labels: t.labels || [] } });
export const comment = (repo, token, n, body) => gh(repo, `/issues/${n}/comments`, { token, method: "POST", body: { body } });
export const addLabels = (repo, token, n, labels) => gh(repo, `/issues/${n}/labels`, { token, method: "POST", body: { labels } });
export const closeIssue = (repo, token, n) =>
  gh(repo, `/issues/${n}`, { token, method: "PATCH", body: { state: "closed", state_reason: "completed" } });
