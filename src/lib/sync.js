import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE } from "../api";

function reduce(x, m) {
  switch (m.type) {
    case "ROOM_STATE": return { ...x, state: m.state, role: m.role, verified: m.verified, participants: m.participants, chat: m.chat, voice: m.voice, you: m.you };
    case "CHAT_MESSAGE": return { ...x, chat: [...x.chat, { id: m.id, user_id: m.user_id, username: m.username, text: m.text, ts: m.ts }].slice(-200) };
    case "CHAT_DELETED": return { ...x, chat: x.chat.filter((c) => c.id !== m.id) };
    case "VOICE_JOINED": return { ...x, voice: [...new Set([...x.voice, m.user_id])] };
    case "VOICE_LEFT": return { ...x, voice: x.voice.filter((u) => u !== m.user_id) };
    case "VOICE_PEERS": return { ...x, voice: [...new Set([...x.voice, ...m.peers, x.you])] };
    case "PLAYBACK_UPDATE": case "SYNC_RESPONSE":
      return x.state && m.state.version < x.state.version ? x : { ...x, state: m.state };   // drop stale updates
    case "PARTICIPANT_JOINED": return { ...x, participants: [...x.participants.filter((p) => p.user_id !== m.user_id), { user_id: m.user_id, username: m.username, verified: false, is_admin: false }] };
    case "PARTICIPANT_LEFT": return { ...x, participants: x.participants.filter((p) => p.user_id !== m.user_id) };
    case "PARTICIPANT_UPDATED": return { ...x, participants: x.participants.map((p) => (p.user_id === m.user_id ? { ...p, verified: m.verified } : p)) };
    case "ROOM_ENDED": return { ...x, ended: true };
    case "ERROR": return { ...x, error: m.message, state: m.state && (!x.state || m.state.version >= x.state.version) ? m.state : x.state };
    default: return x;
  }
}

export function useRoomSocket(roomId) {
  const [s, set] = useState({ conn: "connecting", role: null, state: null, participants: [], verified: false, ended: false, error: "", chat: [], voice: [], you: null });
  const ws = useRef(null), offset = useRef(0), seq = useRef(0), pingAt = useRef(0), endedRef = useRef(false), subs = useRef(new Set());
  const send = useCallback((m) => { if (ws.current?.readyState === 1) ws.current.send(JSON.stringify(m)); }, []);
  const cmd = useCallback((type, value) => send({ type, value, seq: ++seq.current }), [send]);
  const serverNow = useCallback(() => Date.now() / 1000 + offset.current, []);

  useEffect(() => {
    let timer, ping, tries = 0, dead = false;
    const connect = () => {
      const w = new WebSocket(`${WS_BASE}/ws/rooms/${roomId}`);
      ws.current = w;
      w.onopen = () => {
        tries = 0; set((x) => ({ ...x, conn: "open", error: "" }));
        const p = () => { pingAt.current = Date.now() / 1000; send({ type: "PING" }); }; p(); ping = setInterval(p, 10000);
      };
      w.onmessage = (e) => {
        const m = JSON.parse(e.data);
        subs.current.forEach((f) => f(m));
        if (m.type === "PONG") offset.current = m.server_now - (pingAt.current + Date.now() / 1000) / 2;   // RTT-compensated clock offset
        else if (m.state) offset.current = m.state.server_now - Date.now() / 1000;                           // rough until first PONG
        if (m.type === "ROOM_STATE") seq.current = Math.max(seq.current, m.admin_seq);
        if (m.type === "ROOM_ENDED") endedRef.current = true;
        set((x) => reduce(x, m));
      };
      w.onclose = (ev) => {
        clearInterval(ping);
        if (dead) return;
        if (ev.code >= 4000) { set((x) => ({ ...x, conn: "closed", error: endedRef.current ? "" : ev.code === 4000 ? "This room was opened in another tab" : "You no longer have access to this room" })); return; }
        set((x) => ({ ...x, conn: "reconnecting" }));
        timer = setTimeout(connect, Math.min(1000 * 2 ** tries++, 10000));
      };
    };
    connect();
    return () => { dead = true; clearTimeout(timer); clearInterval(ping); ws.current?.close(); };
  }, [roomId, send]);

  const subscribe = useCallback((f) => { subs.current.add(f); return () => subs.current.delete(f); }, []);
  return { ...s, send, cmd, serverNow, subscribe };
}
