import { tr } from '../i18n/index';
import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReferralSummary } from '../lib/types';

export function ReferralCommissionChart({ commissions }: { commissions: ReferralSummary['commissions'] }) {
  const data = useMemo(() => {
    let total = 0;
    return [...commissions].reverse().map((item, index) => {
      total += Number(item.amount || 0);
      return { index: index + 1, total };
    });
  }, [commissions]);

  if (!data.length) return <div className="chart-empty">{tr("Tu evolución de comisiones aparecerá aquí.")}</div>;
  return <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 8, right: 4, left: -26, bottom: 0 }}>
      <defs><linearGradient id="referralFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={0.28}/><stop offset="100%" stopColor="currentColor" stopOpacity={0}/></linearGradient></defs>
      <XAxis dataKey="index" hide/><YAxis hide domain={['dataMin', 'dataMax']}/>
      <Tooltip contentStyle={{ background:'#07171e', border:'1px solid #183b45', borderRadius:12, fontSize:10 }} formatter={(value) => [`${Number(value).toFixed(2)} USDT`, 'Comisiones']} labelFormatter={() => ''}/>
      <Area type="monotone" dataKey="total" stroke="currentColor" strokeWidth={2} fill="url(#referralFill)" dot={false}/>
    </AreaChart>
  </ResponsiveContainer>;
}
