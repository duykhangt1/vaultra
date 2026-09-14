import { BASE, getAccessToken } from './api';
import { toast } from '@/ui/toast';
/** Fetch an authenticated binary (PDF/XLSX/CSV) and hand it to the browser as a download or new tab. */
export async function openAuthed(path: string, filename?: string, newTab = false) {
  try {
    // signed URLs from the API are absolute on the Worker (API_PUBLIC_URL) and relative on the Node API
    const r = await fetch(/^https?:\/\//.test(path) ? path : `${BASE}${path}`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: 'include' });
    if (!r.ok) { const j = await r.json().catch(() => null); throw new Error(j?.error?.message ?? 'Không tải được tệp'); }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    if (newTab) { window.open(url, '_blank'); return; }
    const a = document.createElement('a'); a.href = url; a.download = filename ?? 'download'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) { toast.err((e as Error).message); }
}
