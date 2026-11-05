import { Skeleton } from '@/ui';
import { LogoMark } from './Logo';

/** Placeholder of the signed-in chrome (sidebar + header + content) shown while the session or the page code is loading. */

function buildActiveSupportTicketShellSkeletonViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (active)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const PRIMARY_SCOPED_MOVEOUT_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
] as const;
export function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-[#f5f2eb] lg:grid lg:grid-cols-[264px_1fr]" role="status" aria-busy="true" aria-label="Đang tải">
      <aside className="relative hidden h-dvh flex-col overflow-hidden border-r border-white/[0.08] bg-[#08111e] p-5 lg:flex">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(120%_90%_at_15%_0%,rgb(200_150_62/0.14),transparent_70%)]" aria-hidden />
        <div className="flex items-center gap-2.5">
          <LogoMark light className="size-8 animate-pulse" />
          <Skeleton className="h-5 w-24 !bg-white/15" />
        </div>
        <Skeleton className="mt-4 h-8 w-full rounded-xl !bg-brass-500/15" />
        <div className="mt-5 flex flex-1 flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-xl !bg-white/[0.07]" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-2xl !bg-white/[0.06]" />
      </aside>
      <div className="flex min-w-0 flex-col bg-[#f5f2eb]">
        <div className="flex h-14 items-center gap-3 border-b border-steel-200/80 bg-white/85 px-4 backdrop-blur-md sm:px-6 lg:h-16">
          <Skeleton className="h-8 w-44 rounded-xl" />
          <Skeleton className="ml-auto h-8 w-52 rounded-xl" />
          <Skeleton className="size-9 rounded-xl" />
          <Skeleton className="size-9 rounded-full" />
        </div>
        <div className="mx-auto w-full max-w-[1320px] space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <div className="border-b border-ink-950/[0.08] pb-4">
            <Skeleton className="h-9 w-1/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-steel-200/80 bg-white p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-8 w-32" />
                <Skeleton className="mt-3 h-5 w-36 rounded-md" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-steel-200/80 bg-white p-5">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

function reconcileTenantSupportTicketShellSkeletonLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

type CoreActiveSignatureShellSkeletonTag = 'flow5' | 'active' | 'settled';
