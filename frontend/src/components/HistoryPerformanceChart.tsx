import { tr } from '../i18n/index';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { Trade } from '../lib/types';
import { toNumber } from '../lib/format';

export function HistoryPerformanceChart({ trades }: { trades: Trade[] }) {
  let running = 0;
  const ordered = [...trades].filter(t => t.status === 'CLOSED').reverse();
  const data = [{ name: tr('Inicio'), value: 0 }, ...ordered.map((trade, index) => {
    running += toNumber(trade.pnlUsdt);
    return { name: `${index + 1}`, value: Number(running.toFixed(2)) };
  })];
  if (data.length === 1) data.push({ name: tr('Ahora'), value: 0 });

  return <div className="history-chart">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id="historyYield" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c8ff" stopOpacity={0.34}/>
            <stop offset="100%" stopColor="#22c8ff" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#68818c', fontSize: 9 }}/>
        <Tooltip contentStyle={{ background:'#091821', border:'1px solid #17353d', borderRadius:12 }} formatter={(v) => [`${Number(v).toFixed(2)} USDT`, tr("PnL acumulado")]}/>
        <Area type="monotone" dataKey="value" stroke="#22c8ff" strokeWidth={2.3} fill="url(#historyYield)" dot={false}/>
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}
