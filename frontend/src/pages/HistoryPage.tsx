import { tr } from '../i18n/index';
import { useEffect, useMemo, useState } from 'react';
import { Activity, History, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { HistoryPerformanceChart } from '../components/HistoryPerformanceChart';
import { tradingApi } from '../lib/api';
import { formatDateTime, formatPercentRate, formatUsdt, toNumber } from '../lib/format';
import type { Trade } from '../lib/types';

export function HistoryPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'ALL'|'WIN'|'LOSS'>('ALL');

  const load = async () => { setError(''); try { setTrades((await tradingApi.history(100)).items); } catch { setError('No pudimos cargar tu historial.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => trades.filter(t => filter === 'ALL' || (filter === 'WIN' ? toNumber(t.pnlUsdt) >= 0 : toNumber(t.pnlUsdt) < 0)), [trades, filter]);
  const stats = useMemo(() => {
    const wins = trades.filter(t => toNumber(t.pnlUsdt) >= 0).length;
    const total = trades.reduce((s,t) => s + toNumber(t.pnlUsdt), 0);
    return { wins, losses: trades.length - wins, total, winRate: trades.length ? (wins/trades.length)*100 : 0 };
  }, [trades]);

  return <AppLayout title={tr("Historial")} subtitle={tr("RESULTADOS CERRADOS")}>
    {loading ? <><div className="skeleton skeleton--hero"/><div className="skeleton skeleton--chart"/></> : error ? <section className="panel-state"><History size={28}/><strong>{tr("No disponible")}</strong><p>{tr(error)}</p><button className="secondary-button" onClick={() => {setLoading(true); void load();}}><RefreshCw size={16}/>{' '}{tr("Reintentar")}</button></section> : <>
      <section className="history-hero"><div className="history-hero__top"><div><span>{tr("PnL acumulado")}</span><strong className={stats.total >= 0 ? 'positive' : 'negative'}>{stats.total >= 0 ? '+' : ''}{formatUsdt(String(stats.total))} USDT</strong></div><div className="win-rate"><span>{tr("Win rate")}</span><strong>{stats.winRate.toFixed(0)}%</strong></div></div><HistoryPerformanceChart trades={trades}/></section>

      <section className="history-stats"><div><TrendingUp size={17}/><span>{tr("Ganadoras")}</span><strong>{stats.wins}</strong></div><div><TrendingDown size={17}/><span>{tr("Perdedoras")}</span><strong>{stats.losses}</strong></div><div><Activity size={17}/><span>Total</span><strong>{trades.length}</strong></div></section>

      <div className="history-filters"><button className={filter==='ALL'?'active':''} onClick={() => setFilter('ALL')}>{tr("Todas")}</button><button className={filter==='WIN'?'active':''} onClick={() => setFilter('WIN')}>{tr("Ganadoras")}</button><button className={filter==='LOSS'?'active':''} onClick={() => setFilter('LOSS')}>{tr("Pérdidas")}</button></div>

      <section className="history-list">{filtered.length ? filtered.map(t => { const pos=toNumber(t.pnlUsdt)>=0; return <article className="history-trade" key={t.id}><div className="history-trade__icon">{t.symbol.slice(0,1)}</div><div className="history-trade__main"><strong>{t.symbol.replace('USDT','')}/USDT <span className={t.side==='LONG'?'positive':'negative'}>{t.side}</span></strong><span>{formatDateTime(t.closedAt)} · {tr("Ciclo")} {t.cycleId.slice(-6)}</span><small>{tr("Entrada")}{' '}{t.entryPrice ? Number(t.entryPrice).toLocaleString('en-US',{maximumFractionDigits:4}) : '—'} · {tr("Salida")} {t.exitPrice ? Number(t.exitPrice).toLocaleString('en-US',{maximumFractionDigits:4}) : '—'}</small></div><div className="history-trade__result"><strong className={pos?'positive':'negative'}>{pos?'+':''}{formatUsdt(t.pnlUsdt)} USDT</strong><span className={pos?'positive':'negative'}>{formatPercentRate(t.pnlRate)}</span></div></article>; }) : <div className="panel-state panel-state--compact"><History size={25}/><strong>{tr("Sin operaciones")}</strong><p>{tr("No hay operaciones que coincidan con este filtro.")}</p></div>}</section>
    </>}
  </AppLayout>;
}
