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
