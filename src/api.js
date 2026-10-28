// VITE_API_URL is empty in local dev (Vite proxies /api and /ws) and the Render URL in production.
export const API = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const WS_BASE = API ? API.replace(/^http/, "ws") : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
let csrf = "";
export const setCsrf = (t) => { csrf = t || ""; };
export const getCsrf = () => csrf;
export const errText = (d) => (typeof d?.detail === "string" ? d.detail : "Request failed");
export async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(API + path, {
    method, credentials: "include",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = r.headers.get("content-type")?.includes("json") ? await r.json() : null;
  if (!r.ok) throw new Error(errText(d));
  return d;
}
