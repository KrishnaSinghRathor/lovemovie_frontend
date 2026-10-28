import { useEffect, useRef, useState } from "react";

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };   // add a TURN server here for strict networks
const gather = (pc) => new Promise((res) => {      // wait for ICE candidates so one message carries the whole offer/answer
  if (pc.iceGatheringState === "complete") return res();
  const f = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", f); res(); } };
  pc.addEventListener("icegatheringstatechange", f); setTimeout(res, 3000);
});

export function PeerAudio({ stream, volume }) {
  const r = useRef(null);
  useEffect(() => { r.current.srcObject = stream; }, [stream]);
  useEffect(() => { r.current.volume = volume; }, [volume]);
  return <audio ref={r} autoPlay />;
}

export function useVoice(rs) {
  const [active, setActive] = useState(false), [muted, setMuted] = useState(false), [streams, setStreams] = useState({}), [speaking, setSpeaking] = useState({}), [error, setError] = useState("");
  const pcs = useRef({}), local = useRef(null), an = useRef({}), ctx = useRef(null), r = useRef(rs); r.current = rs;

  const watch = (uid, stream) => { try { const a = ctx.current.createAnalyser(); a.fftSize = 512; ctx.current.createMediaStreamSource(stream).connect(a); an.current[uid] = a; } catch { /* speaking indicator is optional */ } };
  const closePeer = (uid) => { pcs.current[uid]?.close(); delete pcs.current[uid]; delete an.current[uid]; setStreams((s) => { const o = { ...s }; delete o[uid]; return o; }); };
  const peer = (uid) => {
    if (pcs.current[uid]) return pcs.current[uid];
    const pc = new RTCPeerConnection(ICE); pcs.current[uid] = pc;
    local.current.getTracks().forEach((t) => pc.addTrack(t, local.current));
    pc.ontrack = (e) => { setStreams((s) => ({ ...s, [uid]: e.streams[0] })); watch(uid, e.streams[0]); };
    pc.onconnectionstatechange = () => pc.connectionState === "failed" && closePeer(uid);
    return pc;
  };
  const reply = async (uid, pc) => { await gather(pc); r.current.send({ type: "VOICE_SIGNAL", to: uid, data: { sdp: pc.localDescription } }); };
  const setMute = (m) => { local.current?.getAudioTracks().forEach((t) => { t.enabled = !m; }); setMuted(m); };
  const teardown = () => {
    Object.keys(pcs.current).forEach(closePeer);
    local.current?.getTracks().forEach((t) => t.stop()); local.current = null; delete an.current.me;
    setActive(false); setMuted(false);
  };

  const join = async () => {
    setError("");
    try { local.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { return setError("Microphone unavailable or permission denied (voice needs HTTPS or localhost)."); }
    ctx.current ||= new AudioContext(); ctx.current.resume();
    watch("me", local.current); setActive(true); r.current.send({ type: "VOICE_JOIN" });
  };
  const leave = () => { r.current.send({ type: "VOICE_LEAVE" }); teardown(); };

  useEffect(() => rs.subscribe(async (m) => {
    if (!local.current) return;
    try {
      if (m.type === "VOICE_PEERS") for (const u of m.peers) { const pc = peer(u); await pc.setLocalDescription(await pc.createOffer()); await reply(u, pc); }
      else if (m.type === "VOICE_SIGNAL" && m.data.sdp) {
        const pc = peer(m.from); await pc.setRemoteDescription(m.data.sdp);
        if (m.data.sdp.type === "offer") { await pc.setLocalDescription(await pc.createAnswer()); await reply(m.from, pc); }
      } else if (m.type === "VOICE_LEFT") closePeer(m.user_id);
      else if (m.type === "VOICE_FORCE_MUTE") setMute(true);
    } catch { setError("Voice connection problem with a participant"); }
  }), [rs.subscribe]);   // eslint-disable-line

  useEffect(() => { if (active && (rs.ended || rs.conn === "closed" || rs.conn === "reconnecting")) { teardown(); setError("Voice disconnected. Join voice again."); } }, [rs.ended, rs.conn]);   // eslint-disable-line
  useEffect(() => () => teardown(), []);   // eslint-disable-line
  useEffect(() => {
    const buf = new Uint8Array(256);
    const t = setInterval(() => { const s = {}; for (const [u, a] of Object.entries(an.current)) { a.getByteTimeDomainData(buf); s[u] = buf.some((b) => Math.abs(b - 128) > 14); } setSpeaking(s); }, 300);
    return () => clearInterval(t);
  }, []);
  return { active, muted, streams, speaking: { ...speaking, me: speaking.me && !muted }, error, join, leave, setMute };
}
