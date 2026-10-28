import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API, api, errText, getCsrf } from "../api";

const probe = (f) => new Promise((res, rej) => {
  const v = document.createElement("video"); v.preload = "metadata"; v.src = URL.createObjectURL(f);
  v.onloadedmetadata = () => { res({ duration: v.duration, res: `${v.videoWidth}x${v.videoHeight}` }); URL.revokeObjectURL(v.src); };
  v.onerror = () => rej(new Error("This browser cannot read that video file"));
});

export default function Library() {
  const nav = useNavigate();
  const [movies, setMovies] = useState([]), [rooms, setRooms] = useState([]), [err, setErr] = useState(""), [up, setUp] = useState(null), [pw, setPw] = useState({});
  const load = () => Promise.all([api("/api/movies"), api("/api/rooms")]).then(([m, r]) => { setMovies(m); setRooms(r); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    e.preventDefault(); setErr("");
    const form = e.target, f = form.file.files[0]; if (!f) return;
    try {
      const m = await probe(f);
      await new Promise((res, rej) => {
        const x = new XMLHttpRequest();
        x.open("POST", `${API}/api/movies?title=${encodeURIComponent(form.title.value || f.name)}&filename=${encodeURIComponent(f.name)}&duration=${m.duration}&resolution=${m.res}`);
        x.withCredentials = true; x.setRequestHeader("X-CSRF-Token", getCsrf());
        x.upload.onprogress = (ev) => setUp(ev.loaded / ev.total);
        x.onload = () => { if (x.status === 201) return res(); let d; try { d = JSON.parse(x.responseText); } catch {} rej(new Error(errText(d))); };
        x.onerror = () => rej(new Error("Network error during upload"));
        x.send(f);
      });
      form.reset(); load();
    } catch (x) { setErr(x.message); } finally { setUp(null); }
  };
  const act = (fn) => async () => { try { await fn(); load(); } catch (x) { setErr(x.message); } };
  const create = (m) => async () => { try { const r = await api("/api/rooms", { method: "POST", body: { movie_id: m.id, password: pw[m.id] || null } }); nav(`/room/${r.id}`); } catch (x) { setErr(x.message); } };

  return (
    <div className="space-y-6">
      {err && <p className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{err}</p>}
      <form onSubmit={upload} className="card flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1"><label className="text-xs text-neutral-400">Title</label><input className="inp" name="title" placeholder="Movie title" /></div>
        <input type="file" name="file" accept=".mp4,.m4v,.webm,.mkv" className="text-sm" required />
        <button className="btn" disabled={up !== null}>{up !== null ? `Uploading ${(up * 100).toFixed(0)}%` : "Upload"}</button>
        <p className="w-full text-xs text-neutral-500">Only upload movies you own or have permission to share.</p>
      </form>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Movie library</h2>
        {!movies.length && <p className="text-sm text-neutral-500">No movies yet. Upload one above.</p>}
        {movies.map((m) => (
          <div key={m.id} className="card flex flex-wrap items-center gap-3">
            <div className="min-w-48 flex-1"><div className="font-medium">{m.title}</div>
              <div className="text-xs text-neutral-500">
  {Number.isFinite(m.file_size)
    ? `${(m.file_size / 1048576).toFixed(0)} MB`
    : "Size unknown"}
  {" · "}
  {Number.isFinite(m.duration)
    ? `${Math.round(m.duration / 60)} min`
    : "Duration unknown"}
  {" · "}
  {m.resolution || "Resolution unknown"}
  {" · sha256 "}
  {typeof m.checksum === "string" && m.checksum.length > 0
    ? `${m.checksum.slice(0, 10)}…`
    : "Unavailable"}
</div></div>
            <input className="inp w-40" placeholder="Room password (optional)" value={pw[m.id] || ""} onChange={(e) => setPw({ ...pw, [m.id]: e.target.value })} />
            <button className="btn" onClick={create(m)}>Create room</button>
            <button className="btn2" onClick={act(() => api(`/api/movies/${m.id}`, { method: "DELETE" }))}>Delete</button>
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Open rooms</h2>
        {!rooms.length && <p className="text-sm text-neutral-500">No open rooms.</p>}
        {rooms.map((r) => (
          <div key={r.id} className="card flex items-center gap-3"><span className="font-mono tracking-widest">{r.room_code}</span>
            <span className="flex-1 text-xs text-neutral-500">{r.locked ? "locked" : "open"}{r.has_password ? " · password" : ""}</span>
            <button className="btn2" onClick={() => nav(`/room/${r.id}`)}>Enter</button></div>
        ))}
      </section>
    </div>
  );
}
