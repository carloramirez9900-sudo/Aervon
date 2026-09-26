import { tr } from '../i18n/index';
import { ArrowDownRight, ArrowUpRight, Clock3 } from 'lucide-react';
import { formatDateTime, formatPercentRate, formatUsdt, toNumber } from '../lib/format';
import type { Trade } from '../lib/types';

export function TradeCard({ trade }: { trade: Trade }) {
  const positive = toNumber(trade.pnlRate) >= 0;
  const closed = trade.status === 'CLOSED';
  return (
    <article className="trade-card">
      <div className="trade-card__head">
        <div className="trade-symbol"><span className="coin-dot">{trade.symbol.slice(0, 1)}</span><div><strong>{trade.symbol.replace('USDT', '')}</strong><small>/USDT · {trade.timeframe}</small></div></div>
        <span className={`status-pill status-pill--${trade.status.toLowerCase()}`}>{trade.status === 'OPEN' ? tr("ABIERTA") : trade.status === 'CLOSED' ? tr("CERRADA") : tr("PROGRAMADA")}</span>
      </div>
      <div className="trade-card__grid">
        <div><span>{tr("Dirección")}</span><strong className={trade.side === 'LONG' ? 'positive' : 'negative'}>{trade.side === 'LONG' ? <ArrowUpRight size={15}/> : <ArrowDownRight size={15}/>} {trade.side}</strong></div>
        <div><span>{tr("Entrada")}</span><strong>{trade.entryPrice ? Number(trade.entryPrice).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'}</strong></div>
        <div><span>{tr("Salida")}</span><strong>{trade.exitPrice ? Number(trade.exitPrice).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'}</strong></div>
        <div><span>PnL</span><strong className={closed ? (positive ? 'positive' : 'negative') : ''}>{closed ? formatPercentRate(trade.pnlRate) : '—'}</strong></div>
      </div>
      <div className="trade-card__result">
        <span>{tr("Tu resultado")}</span>
        <strong className={closed ? (positive ? 'positive' : 'negative') : ''}>{closed && trade.pnlUsdt ? `${positive ? '+' : ''}${formatUsdt(trade.pnlUsdt)} USDT` : tr("Pendiente")}</strong>
      </div>
      <div className="trade-card__time"><Clock3 size={13}/><span>{closed ? `${tr('Cerrada')} ${formatDateTime(trade.closedAt)}` : `${tr('Programada')} ${formatDateTime(trade.scheduledOpenAt)}`}</span></div>
    </article>
  );
}
