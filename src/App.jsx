import { createContext, useContext, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { api, setCsrf } from "./api";
import Auth from "./pages/Auth";
import Join from "./pages/Join";
import Library from "./pages/Library";
import Room from "./pages/Room";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => { api("/api/auth/me").then((d) => { setCsrf(d.csrf_token); setUser(d.user); }).catch(() => setUser(null)); }, []);
  const logout = async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); setUser(null); };
  if (user === undefined) return <p className="p-8 text-neutral-400">Loading…</p>;
  const home = user?.role === "admin" ? <Library /> : <Join />;
  return (
    <Ctx.Provider value={{ user, setUser }}>
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <Link to="/" className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-lg font-semibold text-transparent">SyncCinema</Link>
        {user && <div className="flex items-center gap-3 text-sm text-neutral-400">{user.username} ({user.role})<button className="btn2" onClick={logout}>Log out</button></div>}
      </header>
      <main className="mx-auto max-w-6xl p-6">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Auth />} />
          <Route path="/" element={user ? home : <Navigate to="/login" />} />
          <Route path="/join/:code?" element={user ? <Join /> : <Navigate to="/login" />} />
          <Route path="/room/:id" element={user ? <Room /> : <Navigate to="/login" />} />
          <Route path="*" element={<p className="text-neutral-400">Page not found. <Link className="text-violet-400" to="/">Go home</Link></p>} />
        </Routes>
      </main>
    </Ctx.Provider>
  );
}
