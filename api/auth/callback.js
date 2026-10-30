// GET /api/auth/callback: GitHub sends the person back here with a one-time code.
export { callback as default } from "../../lib/oauth.js";
