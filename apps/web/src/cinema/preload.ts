/**
 * Real loading progress for the signature intro. Critical assets (fonts, hero poster, hero video)
 * register here; the intro shows done/total and lifts when everything settled — or when the cap is
 * reached, in which case remaining assets keep loading in the background (never blocks the page).
 */
type Listener = (p: { done: number; total: number; failed: number }) => void;
let total = 0;
let done = 0;
let failed = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l({ done, total, failed }));

export function track<T>(p: Promise<T>, timeoutMs = 6000): Promise<T | undefined> {
  total += 1; emit();
  let settled = false;
  const finish = (ok: boolean) => { if (settled) return; settled = true; done += 1; if (!ok) failed += 1; emit(); };
  const timer = window.setTimeout(() => finish(false), timeoutMs);
  return p.then((v) => { window.clearTimeout(timer); finish(true); return v; }, () => { window.clearTimeout(timer); finish(false); return undefined; });
}

export function onProgress(l: Listener) { listeners.add(l); l({ done, total, failed }); return () => { listeners.delete(l); }; }

export function trackImage(src: string, timeoutMs?: number) {
  return track(new Promise<void>((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(); i.onerror = () => rej(new Error(src)); i.src = src; }), timeoutMs);
}

/** Video counts as ready when it can play the first frames (not the whole file). */
export function trackVideo(v: HTMLVideoElement, timeoutMs = 3500) {
  return track(new Promise<void>((res, rej) => {
    if (v.readyState >= 3) return res();
    const ok = () => { cleanup(); res(); }; const ko = () => { cleanup(); rej(new Error('video')); };
    const cleanup = () => { v.removeEventListener('canplay', ok); v.removeEventListener('error', ko, true); };
    v.addEventListener('canplay', ok); v.addEventListener('error', ko, true);
  }), timeoutMs);
}
