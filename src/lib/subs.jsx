import { useEffect, useRef, useState } from "react";
import { API, api } from "../api";

export async function readText(file) {      // UTF-8 first, then Windows-1252 (common for older .srt files)
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("windows-1252").decode(buf); }
}
export const toVtt = (t) => {
  t = t.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  return t.startsWith("WEBVTT") ? t + "\n" : "WEBVTT\n\n" + t.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2") + "\n";
};

export function useSubtitles(movie, vid, url) {
  const [list, setList] = useState([]), [urls, setUrls] = useState({}), [active, setActive] = useState("off"), [local, setLocal] = useState(null);
  const seen = useRef(new Set());
  const reload = async () => { if (movie) try { setList(await api(`/api/movies/${movie.id}/subtitles`)); } catch { /* not available yet */ } };
  useEffect(() => { reload(); const t = setInterval(reload, 20000); return () => clearInterval(t); }, [movie?.id]);   // eslint-disable-line
  useEffect(() => {
    list.forEach(async (s) => {
      if (seen.current.has(s.id)) return;
      seen.current.add(s.id);
      const r = await fetch(`${API}/api/subtitles/${s.id}`, { credentials: "include" });
      if (!r.ok) return;
      const u = URL.createObjectURL(new Blob([await r.text()], { type: "text/vtt" }));
      setUrls((x) => ({ ...x, [s.id]: u }));
    });
  }, [list]);
  const tracks = [...list.filter((s) => urls[s.id]).map((s) => ({ id: s.id, label: s.label, lang: s.lang, url: urls[s.id] })), ...(local ? [local] : [])];
  useEffect(() => {      // subtitles are a personal choice: they follow the video clock, so they stay in sync with the room
    const v = vid.current;
    if (v) for (const t of v.textTracks) t.mode = t.id === active ? "showing" : "disabled";
  }, [tracks.length, active, url]);   // eslint-disable-line
  const loadLocal = async (file) => {
    const t = toVtt(await readText(file));
    if (!t.includes("-->")) return false;
    if (local) URL.revokeObjectURL(local.url);
    setLocal({ id: "local", label: `My file: ${file.name}`, lang: "", url: URL.createObjectURL(new Blob([t], { type: "text/vtt" })) });
    setActive("local");
    return true;
  };
  return { list, tracks, active, setActive, loadLocal, reload };
}

export function SubtitlePicker({ subs }) {
  const [err, setErr] = useState("");
  return (
    <>
      <select className="btn2" value={subs.active} onChange={(e) => subs.setActive(e.target.value)} title="Subtitles (only for you)">
        <option value="off">Subtitles: off</option>
        {subs.tracks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <label className="btn2 cursor-pointer">Load file
        <input type="file" accept=".srt,.vtt" hidden onChange={async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) setErr((await subs.loadLocal(f)) ? "" : "Not a subtitle file"); }} /></label>
      {err && <span className="text-xs text-red-400">{err}</span>}
    </>
  );
}

export function SubtitleAdmin({ subs, movie }) {
  const [label, setLabel] = useState(""), [lang, setLang] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const add = async (e) => {
    e.preventDefault(); const form = e.target, f = form.file.files[0]; if (!f) return;
    setBusy(true); setErr("");
    try {
      await api(`/api/movies/${movie.id}/subtitles`, { method: "POST", body: { label: label || f.name.replace(/\.[^.]+$/, ""), lang, content: await readText(f) } });
      form.reset(); setLabel(""); setLang(""); await subs.reload();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const del = async (id) => { try { await api(`/api/subtitles/${id}`, { method: "DELETE" }); await subs.reload(); } catch (x) { setErr(x.message); } };
  return (
    <div className="card space-y-2 text-sm">
      <h2 className="font-medium">Subtitles</h2>
      {!subs.list.length && <p className="text-xs text-neutral-500">None yet. Add an .srt or .vtt file; everyone in the room can pick it.</p>}
      <ul className="space-y-1">{subs.list.map((s) => <li key={s.id} className="flex"><span className="flex-1">{s.label}{s.lang && ` (${s.lang})`}</span><button className="text-xs text-red-400" onClick={() => del(s.id)}>Delete</button></li>)}</ul>
      <form onSubmit={add} className="space-y-2">
        <input type="file" name="file" accept=".srt,.vtt" className="text-xs" required />
        <div className="flex gap-2"><input className="inp" placeholder="Label, e.g. English" value={label} onChange={(e) => setLabel(e.target.value)} /><input className="inp w-20" placeholder="en" maxLength={12} value={lang} onChange={(e) => setLang(e.target.value)} /></div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? "Adding…" : "Add subtitles"}</button>
      </form>
    </div>
  );
}
