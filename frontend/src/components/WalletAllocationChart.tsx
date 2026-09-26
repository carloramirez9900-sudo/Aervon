import { tr } from '../i18n/index';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { toNumber } from '../lib/format';
import type { DashboardData } from '../lib/types';

export function WalletAllocationChart({ wallet }: { wallet: DashboardData['wallet'] }) {
  const data = [
    { name: tr('Disponible'), value: toNumber(wallet.availableBalance) },
    { name: tr('Capital activo'), value: toNumber(wallet.activePrincipal) },
    { name: tr('Reinversión'), value: toNumber(wallet.pendingCompound) },
    { name: tr('Retiro pendiente'), value: toNumber(wallet.withdrawalPending) },
  ].filter((item) => item.value > 0);
  const safe = data.length ? data : [{ name: tr('Sin saldo'), value: 1 }];
  const colors = ['#20f59a', '#22c8ff', '#8a7dff', '#ffc857'];

  return <div className="wallet-chart" aria-label={tr("Distribución de saldo")}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={safe} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="88%" paddingAngle={3} stroke="none">
          {safe.map((_, index) => <Cell key={index} fill={data.length ? colors[index % colors.length] : '#17313a'} />)}
        </Pie>
        <Tooltip contentStyle={{ background: '#091821', border: '1px solid #17353d', borderRadius: 12 }} formatter={(value) => [`${Number(value).toFixed(2)} USDT`, '']} />
      </PieChart>
    </ResponsiveContainer>
    <div className="wallet-chart__center"><strong>{toNumber(wallet.totalBalance).toFixed(2)}</strong><span>USDT</span></div>
  </div>;
}
