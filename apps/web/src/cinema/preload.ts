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
