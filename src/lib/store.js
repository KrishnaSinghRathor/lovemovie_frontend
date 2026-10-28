// Chunked local storage in IndexedDB (resumable) + streaming SHA-256 verification.
import { createSHA256 } from "hash-wasm";
import { API } from "../api";
const CHUNK = 8 * 1024 * 1024;
const key = (id, i) => `${id}:${String(i).padStart(6, "0")}`;
const range = (id) => IDBKeyRange.bound(`${id}:`, `${id}:\uffff`);
const open = () => new Promise((res, rej) => { const q = indexedDB.open("synccinema", 1); q.onupgradeneeded = () => q.result.createObjectStore("chunks"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const tx = async (mode, fn) => {
  const d = await open();
  return new Promise((res, rej) => { const t = d.transaction("chunks", mode); const r = fn(t.objectStore("chunks")); t.oncomplete = () => { d.close(); res(r?.result); }; t.onerror = t.onabort = () => rej(t.error); });
};
const getChunks = (id) => tx("readonly", (s) => s.getAll(range(id)));
export const clearLocal = (id) => tx("readwrite", (s) => s.delete(range(id)));
export const localSize = async (id) => (await getChunks(id)).reduce((n, b) => n + b.size, 0);

export async function download(movie, onProgress, signal) {
  const have = await localSize(movie.id);
  if (have >= movie.file_size) return;
  let idx = Math.floor(have / CHUNK);                       // only full chunks are stored until the stream ends
  const res = await fetch(`${API}/api/movies/${movie.id}/download`, { credentials: "include", signal, headers: idx ? { Range: `bytes=${idx * CHUNK}-` } : {} });
  if (res.status !== 200 && res.status !== 206) throw new Error(res.status === 404 ? "Downloads are not available to you in this room" : "Download failed");
  if (idx && res.status === 200) { await clearLocal(movie.id); idx = 0; }
  let buf = [], len = 0, got = idx * CHUNK;
  const flush = async () => { await tx("readwrite", (s) => s.put(new Blob(buf), key(movie.id, idx++))); buf = []; len = 0; };
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length; onProgress(got);
    let v = value;
    while (len + v.length >= CHUNK) { const n = CHUNK - len; buf.push(v.subarray(0, n)); v = v.subarray(n); len = CHUNK; await flush(); }
    if (v.length) { buf.push(v); len += v.length; }
  }
  if (len) await flush();
}

export async function verify(movie, onProgress) {
  const h = await createSHA256(); h.init(); let n = 0;
  for (const b of await getChunks(movie.id)) { h.update(new Uint8Array(await b.arrayBuffer())); onProgress((n += b.size)); }
  return n === movie.file_size && h.digest() === movie.checksum;
}
export const localUrl = async (movie) => URL.createObjectURL(new Blob(await getChunks(movie.id)));
