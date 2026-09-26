import { tr } from '../i18n/index';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Clock3, RefreshCw, TrendingUp } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { PerformanceChart } from '../components/PerformanceChart';
import { TradeCard } from '../components/TradeCard';
import { tradingApi } from '../lib/api';
import { formatDateTime, formatPercentRate, formatUsdt } from '../lib/format';
import type { TradingCurrentResponse } from '../lib/types';

export function TradingPage() {
  const [data, setData] = useState<TradingCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try { setData(await tradingApi.current()); }
    catch { setError('No pudimos cargar el ciclo de trading.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const trades = data?.trades ?? [];
  const closed = useMemo(() => trades.filter(t => t.status === 'CLOSED').length, [trades]);
  const progress = data?.cycle ? Math.min(100, (closed / Math.max(1, data.cycle.expectedTradeCount)) * 100) : 0;

  return <AppLayout title={tr("Trading unificado")} subtitle={tr("CICLO DE 24 HORAS")}>
    {loading ? <><div className="skeleton skeleton--hero"/><div className="skeleton skeleton--chart"/></> : error ? <section className="panel-state"><Activity size={28}/><strong>{tr("No disponible")}</strong><p>{tr(error)}</p><button className="secondary-button" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={16}/>{' '}{tr("Reintentar")}</button></section> : !data?.cycle ? <section className="panel-state"><Clock3 size={28}/><strong>{tr("Próximo ciclo pendiente")}</strong><p>{tr("Cuando se programe el próximo ciclo completo aparecerá aquí.")}</p></section> : <>
      <section className="trading-hero">
        <div className="trading-hero__top"><div><span className="eyebrow">{tr("CICLO #")}{data.cycle.sequence}</span><h2>{data.cycle.status === 'RUNNING' ? tr("Trading activo") : tr('Ciclo programado')}</h2></div><span className="live-chip"><span/> {data.cycle.status === 'RUNNING' ? tr('EN CURSO') : tr('PROGRAMADO')}</span></div>
        <div className="trading-kpis">
          <div><span>{tr("Rendimiento")}</span><strong className="positive">{formatPercentRate(data.cycle.accumulatedPnlRate)}</strong></div>
          <div><span>{tr("Tu resultado")}</span><strong className="positive">{data.cycle.accumulatedPnlUsdt ? `+${formatUsdt(data.cycle.accumulatedPnlUsdt)} USDT` : '—'}</strong></div>
          <div><span>{tr("Operaciones")}</span><strong>{closed}/{data.cycle.expectedTradeCount}</strong></div>
        </div>
        <PerformanceChart trades={trades}/>
        <div className="cycle-progress"><div><span style={{ width: `${progress}%` }}/></div><small><Clock3 size={13}/> {formatDateTime(data.cycle.startsAt)} · {tr("termina")} {formatDateTime(data.cycle.endsAt)}</small></div>
      </section>

      <section className="market-strip"><TrendingUp size={18}/><div><strong>{tr("Actividad unificada")}</strong><span>{tr("Las 5 operaciones del ciclo son compartidas por todos los participantes del mismo ciclo.")}</span></div></section>

      <section className="trades-section"><div className="section-heading"><div><span className="eyebrow">{tr("OPERACIONES DEL CICLO")}</span><h2>{tr("Aperturas y cierres")}</h2></div><span className="counter-badge">{closed}/5</span></div><div className="trade-list">{trades.map(t => <TradeCard key={t.id} trade={t}/>)}</div></section>
      <div className="disclosure"><Activity size={14}/><p>{tr("Actividad simulada de trading unificado, contextualizada con referencias de mercado. No representa órdenes ejecutadas en un exchange.")}</p></div>
    </>}
  </AppLayout>;
}
