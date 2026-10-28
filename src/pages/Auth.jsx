import { useState } from "react";
import { api, setCsrf } from "../api";
import { useAuth } from "../App";

export default function Auth() {
  const { setUser } = useAuth();
  const [reg, setReg] = useState(false), [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    const f = Object.fromEntries(new FormData(e.target));
    try {
      if (reg) await api("/api/auth/register", { method: "POST", body: f });
      const d = await api("/api/auth/login", { method: "POST", body: { username: f.username, password: f.password } });
      setCsrf(d.csrf_token); setUser(d.user);
    } catch (x) { setErr(x.message); }
  };
  return (
    <form onSubmit={submit} className="card mx-auto mt-16 max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">{reg ? "Create account" : "Sign in"}</h1>
      <input className="inp" name="username" placeholder="Username" required />
      {reg && <input className="inp" name="email" type="email" placeholder="Email" required />}
      <input className="inp" name="password" type="password" placeholder="Password (min 10 chars)" required />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button className="btn w-full">{reg ? "Register" : "Sign in"}</button>
      <button type="button" className="text-sm text-neutral-400" onClick={() => setReg(!reg)}>{reg ? "Have an account? Sign in" : "New here? Create an account"}</button>
    </form>
  );
}
