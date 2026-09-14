import { HelpTip } from '@/ui';

/** A title, column header or label with its hover explanation (the "i") right beside it. */
export function Titled({ label, help, onDark }: { label: React.ReactNode; help: string; onDark?: boolean }) {
  return (
    <span className="inline-flex items-center">
      {label}
      <HelpTip text={help} onDark={onDark} label={typeof label === 'string' ? `Giải thích: ${label}` : undefined} />
    </span>
  );
}
