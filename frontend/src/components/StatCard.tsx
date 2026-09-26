import type { LucideIcon } from 'lucide-react';

type Props = { label: string; value: string; sub?: string; icon: LucideIcon; accent?: 'green' | 'cyan' | 'neutral' };
export function StatCard({ label, value, sub, icon: Icon, accent = 'green' }: Props) {
  return (
    <article className={`stat-card stat-card--${accent}`}>
      <div className="stat-card__top"><span>{label}</span><Icon size={17} /></div>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </article>
  );
}
