import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useRoomSocket } from "../lib/sync";
import { clearLocal, download, localSize, localUrl, verify } from "../lib/store";
import { SubtitleAdmin, SubtitlePicker, useSubtitles } from "../lib/subs";
import Social, { VoicePanel } from "./Social";

const fmt = (t) => { t = Math.max(0, t | 0); const h = (t / 3600) | 0, m = ((t % 3600) / 60) | 0; return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(t % 60).padStart(2, "0"); };
const mb = (b) => (b / 1048576).toFixed(0) + " MB";

export default function Room() {
  const playerShell = useRef(null);
  const { id } = useParams(), nav = useNavigate();
  const [info, setInfo] = useState(null), [movie, setMovie] = useState(null), [err, setErr] = useState("");
  const [dl, setDl] = useState({ status: "idle", done: 0, msg: "" }), [url, setUrl] = useState(null), [blocked, setBlocked] = useState(false), [scrub, setScrub] = useState(null);
  const [, tick] = useState(0);
  const rs = useRoomSocket(id), rsRef = useRef(rs); rsRef.current = rs;
  const vid = useRef(null), abort = useRef(null), t0 = useRef(0);
  const admin = rs.role === "admin";
  const subs = useSubtitles(movie, vid, url);

  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, []);
  const refresh = () => api(`/api/rooms/${id}`).then(setInfo);
  useEffect(() => { refresh().then(() => {}).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => { if (info && !movie) api(`/api/movies/${info.movie_id}`).then(setMovie).catch((e) => setErr(e.message)); }, [info]);
  useEffect(() => { if (movie) localSize(movie.id).then((n) => n >= movie.file_size && finish()); }, [movie]);
  useEffect(() => { if (dl.status === "ready" && rs.conn === "open") rs.send({ type: "READY", checksum: movie.checksum }); }, [dl.status, rs.conn]);

  const finish = async () => {
    setDl((d) => ({ ...d, status: "verifying", done: 0 }));
    if (await verify(movie, (done) => setDl((d) => ({ ...d, done })))) { setUrl(await localUrl(movie)); setDl((d) => ({ ...d, status: "ready" })); }
    else { await clearLocal(movie.id); setDl({ status: "error", done: 0, msg: "The file failed verification and was discarded. Download it again." }); }
  };
  const start = async () => {
    abort.current = new AbortController(); t0.current = Date.now();
    setDl({ status: "downloading", done: await localSize(movie.id), msg: "" });
    try { await download(movie, (done) => setDl((d) => ({ ...d, done })), abort.current.signal); await finish(); }
    catch (e) { setDl((d) => e.name === "AbortError" ? { ...d, status: "paused" } : { ...d, status: "error", msg: e.name === "QuotaExceededError" ? "Not enough browser storage for this movie" : e.message }); }
  };

  // Drift correction: follow the authoritative state; small drift -> adjust speed, large drift -> seek.
  useEffect(() => {
    if (!url) return;
    const v = vid.current; let lastSeek = 0;
    const t = setInterval(() => {
      const { state: st, serverNow } = rsRef.current;
      if (!st || v.readyState < 1) return;
      const playing = st.state === "PLAYING";
      const target = playing ? Math.min(st.duration, st.position + (serverNow() - st.server_timestamp) * st.playback_rate) : st.position;
      const drift = v.currentTime - target;
      if (!playing) { if (!v.paused) v.pause(); v.playbackRate = st.playback_rate; if (Math.abs(drift) > 0.1) v.currentTime = target; return; }
      if (Math.abs(drift) > 1 && Date.now() - lastSeek > 1500) { v.currentTime = target; lastSeek = Date.now(); }
      v.playbackRate = Math.abs(drift) > 0.08 && Math.abs(drift) <= 1 ? st.playback_rate * (drift > 0 ? 0.95 : 1.05) : st.playback_rate;
      if (v.paused && !v.ended) v.play().then(() => setBlocked(false), () => setBlocked(true));
    }, 400);
    return () => clearInterval(t);
  }, [url]);

  const adm = (fn) => async () => { try { await fn(); await refresh(); } catch (e) { setErr(e.message); } };
  if (err && !info) return <p className="text-red-400">{err} <button className="btn2 ml-2" onClick={() => nav("/")}>Back</button></p>;
  if (!info || !movie) return <p className="text-neutral-400">Loading room…</p>;

  const st = rs.state, playing = st?.state === "PLAYING";
  const pos = st ? (playing ? Math.min(st.duration, st.position + (rs.serverNow() - st.server_timestamp) * st.playback_rate) : st.position) : 0;
  const pct = movie.file_size ? Math.min(100, (dl.done / movie.file_size) * 100) : 0;
  const speed = dl.status === "downloading" && Date.now() > t0.current + 2000 ? dl.done / ((Date.now() - t0.current) / 1000) : 0;
  const banner = rs.ended ? "The admin ended this room." : rs.conn !== "open" ? (rs.error || "Reconnecting to the room…") : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div><h1 className="text-xl font-semibold">{movie.title}</h1><p className="text-sm text-neutral-500">Hosted by {info.admin}{info.room_code && <> · code <span className="font-mono tracking-widest text-violet-300">{info.room_code}</span></>}</p></div>
        {banner && <p className="rounded-lg bg-amber-950/50 p-3 text-sm text-amber-300">{banner}</p>}
        {rs.error && rs.conn === "open" && <p className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{rs.error}</p>}
       <div
  ref={playerShell}
  className="relative overflow-hidden rounded-2xl border border-white/10 bg-black
             [&:fullscreen]:flex [&:fullscreen]:h-screen
             [&:fullscreen]:w-screen [&:fullscreen]:items-center
             [&:fullscreen]:justify-center [&:fullscreen]:rounded-none"
>
          {url ? <video ref={vid} src={url} className="block h-auto max-h-full w-full object-contain" playsInline disablePictureInPicture tabIndex={-1} onContextMenu={(e) => e.preventDefault()}
                   onError={() => setDl({ status: "error", done: 0, msg: "Your browser cannot play this file (unsupported codec). Try Chrome or Edge." })}>  {subs.tracks.map((t) => <track key={t.id} id={t.id} kind="subtitles" label={t.label} srcLang={t.lang || "en"} src={t.url} />)}</video>
               : <div className="flex aspect-video items-center justify-center text-sm text-neutral-500">Download the movie to join playback</div>}
          {url && blocked && <button className="absolute inset-0 bg-black/70 text-lg" onClick={() => vid.current.play().then(() => setBlocked(false))}>Click to enable playback</button>}
          {url && !st && <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-center text-xs">Waiting for room state…</div>}
          <Social rs={rs} admin={admin} />
        </div>
        {url && <div className="flex items-center gap-3 text-sm text-neutral-400"><span>{fmt(pos)} / {fmt(st?.duration || movie.duration)}</span><span>{playing ? "Playing" : st?.state === "ENDED" ? "Ended" : "Paused"}{admin ? "" : " · controlled by admin"}</span>
          <span className="ml-auto">Volume</span><input type="range" min="0" max="1" step="0.05" defaultValue="1" onChange={(e) => (vid.current.volume = e.target.value)} />
          <button
  className="btn2"
  onClick={() => playerShell.current?.requestFullscreen?.()}
>
  Fullscreen
</button><SubtitlePicker subs={subs} /></div>}

        {dl.status !== "ready" && (
          <div className="card space-y-3">
            <div className="flex justify-between text-sm"><span>{({ idle: "Not downloaded", downloading: "Downloading…", paused: "Paused", verifying: "Verifying integrity…", error: "Problem" })[dl.status]}</span><span className="text-neutral-400">{mb(dl.done)} / {mb(movie.file_size)}{speed > 0 && ` · ${(speed / 1048576).toFixed(1)} MB/s · ~${fmt((movie.file_size - dl.done) / speed)} left`}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-violet-500 to-blue-500" style={{ width: `${pct}%` }} /></div>
            {dl.msg && <p className="text-sm text-red-400">{dl.msg}</p>}
            {!info.allow_downloads && !admin && <p className="text-sm text-amber-300">The admin has disabled downloads for this room.</p>}
            <div className="flex gap-2">
              {["idle", "paused", "error"].includes(dl.status) && <button className="btn" onClick={start}>{dl.status === "paused" ? "Resume download" : "Download movie"}</button>}
              {dl.status === "downloading" && <button className="btn2" onClick={() => abort.current.abort()}>Pause</button>}
            </div>
          </div>
        )}

        {admin && (
          <div className="card space-y-3">
            <h2 className="font-medium">Playback controls <span className="text-xs text-neutral-500">(admin only)</span></h2>
            <input type="range" className="w-full" min="0" max={st?.duration || movie.duration} step="1" value={Math.floor(scrub ?? pos)} onChange={(e) => setScrub(+e.target.value)} onPointerUp={() => { if (scrub !== null) rs.cmd("SEEK", scrub); setScrub(null); }} />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn" onClick={() => rs.cmd(playing ? "PAUSE" : "PLAY")}>{playing ? "Pause" : st?.position > 0 ? "Resume" : "Play"}</button>
              <button className="btn2" onClick={() => rs.cmd("SEEK", Math.max(0, pos - 10))}>−10s</button>
              <button className="btn2" onClick={() => rs.cmd("SEEK", Math.min(st.duration, pos + 10))}>+10s</button>
              <button className="btn2" onClick={() => rs.cmd("RESTART")}>Restart</button>
              <select className="btn2" value={st?.playback_rate || 1} onChange={(e) => rs.cmd("RATE", +e.target.value)}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}x</option>)}</select>
              <button className="btn2" onClick={() => rs.cmd("END")}>End playback</button>
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="card"><h2 className="mb-3 font-medium">Participants ({rs.participants.length})</h2>
          <ul className="space-y-2 text-sm">{rs.participants.map((p) => (
            <li key={p.user_id} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${p.verified ? "bg-emerald-400" : "bg-neutral-600"}`} title={p.verified ? "Ready" : "Not ready"} />
              <span className="flex-1">{p.username}{p.is_admin && <span className="ml-1 text-xs text-violet-300">admin</span>}</span>
              {admin && !p.is_admin && <button className="text-xs text-red-400" onClick={adm(() => api(`/api/rooms/${id}/kick`, { method: "POST", body: { user_id: p.user_id } }))}>Remove</button>}</li>))}</ul>
          <p className="mt-3 text-xs text-neutral-500">Green = file downloaded and verified.</p></div>
        <VoicePanel rs={rs} admin={admin} />
        {admin && <SubtitleAdmin subs={subs} movie={movie} />}
        {admin && (
          <div className="card space-y-2 text-sm"><h2 className="font-medium">Room settings</h2>
            <label className="flex items-center gap-2"><input type="checkbox" checked={info.locked} onChange={(e) => adm(() => api(`/api/rooms/${id}`, { method: "PATCH", body: { locked: e.target.checked } }))()} /> Lock room (no new joins)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={info.allow_downloads} onChange={(e) => adm(() => api(`/api/rooms/${id}`, { method: "PATCH", body: { allow_downloads: e.target.checked } }))()} /> Allow downloads</label>
            <button className="btn2 w-full" onClick={() => navigator.clipboard?.writeText(`${location.origin}/join/${info.room_code}`)}>Copy invite link</button>
            <button className="btn2 w-full text-red-300" onClick={async () => { if (confirm("End this room for everyone?")) { await api(`/api/rooms/${id}/end`, { method: "POST" }).catch((e) => setErr(e.message)); nav("/"); } }}>End room</button></div>
        )}
        {!admin && <button className="btn2 w-full" onClick={async () => { await api(`/api/rooms/${id}/leave`, { method: "POST" }).catch(() => {}); nav("/"); }}>Leave room</button>}
      </aside>
    </div>
  );
}
