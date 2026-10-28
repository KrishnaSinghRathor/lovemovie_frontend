import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

export default function Join() {
  const nav = useNavigate(), { code: c } = useParams();
  const [code, setCode] = useState(c || ""), [pw, setPw] = useState(""), [err, setErr] = useState(""), [needPw, setNeedPw] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setErr("");
    try { const r = await api("/api/rooms/join", { method: "POST", body: { room_code: code, password: pw || null } }); nav(`/room/${r.id}`); }
    catch (x) { setErr(x.message); if (x.message === "Password required") setNeedPw(true); }
  };
  return (
    <form onSubmit={go} className="card mx-auto mt-16 max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">Join a watch room</h1>
      <input className="inp uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Room code" required />
      {needPw && <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Room password" autoFocus />}
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button className="btn w-full">Join</button>
    </form>
  );
}
