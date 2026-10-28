
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Minus, X } from "lucide-react";
import { PeerAudio, useVoice } from "../lib/voice";

export function VoicePanel({ rs, admin }) {
  const v = useVoice(rs);
  const [vols, setVols] = useState({});
  const names = Object.fromEntries(
    rs.participants.map((p) => [p.user_id, p.username])
  );



  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Voice</h2>
        {!v.active ? (
          <button className="btn" onClick={v.join} disabled={rs.conn !== "open"}>
            Join voice
          </button>
        ) : (
          <div className="flex gap-2">
            <button className="btn2" onClick={() => v.setMute(!v.muted)}>
              {v.muted ? "Unmute" : "Mute"}
            </button>
            <button className="btn2" onClick={v.leave}>Leave</button>
          </div>
        )}
      </div>

      {v.error && <p className="text-xs text-red-400">{v.error}</p>}
      <p className="text-xs text-neutral-500">
        Use headphones, otherwise others hear the movie through your mic.
      </p>

      <ul className="space-y-2 text-sm">
        {rs.voice.map((u) => (
          <li key={u} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${
              v.speaking[u === rs.you ? "me" : u]
                ? "bg-emerald-400" : "bg-neutral-600"
            }`} />
            <span className="flex-1">{u === rs.you ? "You" : names[u] || "…"}</span>
            {u !== rs.you && v.active && (
              <input
                type="range" className="w-20" min="0" max="1" step="0.05"
                value={vols[u] ?? 1}
                onChange={(e) => setVols({ ...vols, [u]: +e.target.value })}
              />
            )}
            {admin && u !== rs.you && (
              <button
                className="text-xs text-red-400"
                onClick={() => rs.send({ type: "VOICE_MUTE", user_id: u })}
              >Mute</button>
            )}
          </li>
        ))}
      </ul>

      {Object.entries(v.streams).map(([u, stream]) => (
        <PeerAudio key={u} stream={stream} volume={vols[u] ?? 1} />
      ))}
    </div>
  );
}

export default function Social({ rs, admin }) {
  const [active, setActive] = useState(false);
  const [text, setText] = useState("");
  const [notification, setNotification] = useState(null);

  const end = useRef(null);
  const previousIds = useRef(new Set());
  const initialized = useRef(false);
  const notificationTimer = useRef(null);

  useEffect(() => {
    const messages = rs.chat || [];

    // Don't show old chat history as new notifications on initial load.
    if (!initialized.current) {
      previousIds.current = new Set(messages.map((m) => m.id));
      initialized.current = true;
      return;
    }

    const newMessages = messages.filter(
      (m) => !previousIds.current.has(m.id)
    );

    previousIds.current = new Set(messages.map((m) => m.id));

    // Display the newest message from another participant.
    const incoming = newMessages.filter(
      (m) => m.user_id !== rs.you
    );

    if (incoming.length > 0) {
      const message = incoming[incoming.length - 1];

      setNotification(message);

      clearTimeout(notificationTimer.current);
      notificationTimer.current = setTimeout(() => {
        setNotification(null);
      }, 4000);
    }
  }, [rs.chat, rs.you]);

  useEffect(() => {
    return () => clearTimeout(notificationTimer.current);
  }, []);

useEffect(() => {
  if (!active) return;

  end.current?.scrollIntoView({
    behavior: "smooth",
    block: "end",
  });
}, [rs.chat, active]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim() || rs.conn !== "open") return;
    rs.send({ type: "CHAT", text: text.trim() });
    setText("");
  };

  return (
    <div className="absolute bottom-4 right-4 z-30 w-80 max-w-[calc(100%-2rem)]">
      {notification && (
  <button
    type="button"
    onClick={() => {
      setActive(true);
      setNotification(null);
      clearTimeout(notificationTimer.current);
    }}
    className="mb-3 flex w-full items-start gap-3 rounded-xl border border-white/15 bg-neutral-900/95 p-3 text-left text-white shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
  >
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600">
      <MessageCircle size={18} />
    </div>

    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">
          {notification.username}
        </span>
        <span className="shrink-0 text-xs text-neutral-400">
          Now
        </span>
      </div>

      <p className="break-words text-sm text-neutral-200">
        {notification.text}
      </p>
      <p className="mt-1 text-xs text-violet-300">
        Click to open chat
      </p>
    </div>

    <span
      role="button"
      className="text-neutral-400 hover:text-white"
      onClick={(e) => {
        e.stopPropagation();
        setNotification(null);
        clearTimeout(notificationTimer.current);
      }}
    >
      <X size={16} />
    </span>
  </button>
)}
      {!active ? (
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-full border border-white/15 bg-neutral-950/30 p-2 text-white opacity-40 shadow-lg backdrop-blur-md transition-opacity hover:opacity-90 focus-within:opacity-100"
        >
          <button
            type="button"
            onClick={() => setActive(true)}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Open chat history"
          >
            <MessageCircle size={18} />
          </button>
          
<input
  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-400"
  maxLength={500}
  value={text}
  onChange={(e) => setText(e.target.value)}
  onFocus={() => setActive(true)}
  placeholder="Message the room…"
  aria-label="Message the room"
/>

          <button type="submit" disabled={rs.conn !== "open" || !text.trim()}
            className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40"
            aria-label="Send message"
          >
            <Send size={17} />
          </button>
        </form>
      ) : (
        <section className="flex h-80 flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950/80 text-white shadow-2xl backdrop-blur-xl">
          <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-2 font-medium">
              <MessageCircle size={17} /> Room chat
            </div>
            <div className="flex gap-1">
              <button className="rounded p-1 hover:bg-white/10"
                onClick={() => setActive(false)} aria-label="Minimize chat">
                <Minus size={17} />
              </button>
              <button className="rounded p-1 hover:bg-white/10"
                onClick={() => setActive(false)} aria-label="Close chat">
                <X size={17} />
              </button>
            </div>
          </header>

          
<div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
  {!rs.chat.length && (
    <p className="py-4 text-center text-xs text-neutral-400">
      No messages yet. Say hello!
    </p>
  )}

  {rs.chat.map((m) => {
    const mine = m.user_id === rs.you;

    return (
      <div
        key={m.id}
        className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}
      >
        <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
          <span
            className={`mb-1 px-1 text-xs ${
              mine ? "text-violet-300" : "text-blue-300"
            }`}
          >
            {mine ? "You" : m.username}
          </span>

          <div
            className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${
              mine
                ? "rounded-br-md bg-violet-600 text-white"
                : "rounded-bl-md border border-white/10 bg-neutral-800 text-neutral-100"
            }`}
          >
            {m.text}
          </div>

          {admin && (
            <button
              className="mt-1 px-1 text-xs text-red-400 opacity-70 hover:opacity-100"
              onClick={() => rs.send({ type: "CHAT_DELETE", id: m.id })}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  })}

  <div ref={end} />
</div>


          <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-violet-400"
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message…"
            />
            <button className="btn" disabled={rs.conn !== "open" || !text.trim()}>
              <Send size={16} />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
