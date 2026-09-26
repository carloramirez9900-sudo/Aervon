import { tr } from '../i18n/index';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { Trade } from '../lib/types';
import { toNumber } from '../lib/format';

export function PerformanceChart({ trades }: { trades: Trade[] }) {
  let running = 0;
  const data = [{ name: tr('Inicio'), value: 0 }, ...trades.filter((t) => t.status === 'CLOSED').map((trade) => {
    running += toNumber(trade.pnlRate) * 100;
    return { name: `#${trade.sequence}`, value: Number(running.toFixed(3)) };
  })];
  if (data.length === 1) data.push({ name: tr('Ahora'), value: 0 });

  return (
    <div className="performance-chart" aria-label={tr("Gráfico de rendimiento acumulado del ciclo")}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 2, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id="aervonYield" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#20f59a" stopOpacity={0.38} />
              <stop offset="100%" stopColor="#20f59a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#68818c', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#091821', border: '1px solid #17353d', borderRadius: 12 }} formatter={(v) => [`${Number(v).toFixed(2)}%`, tr("Rendimiento")]} />
          <Area type="monotone" dataKey="value" stroke="#20f59a" strokeWidth={2.4} fill="url(#aervonYield)" dot={{ r: 3, fill: '#20f59a', strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
