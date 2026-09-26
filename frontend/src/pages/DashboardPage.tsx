import { tr } from '../i18n/index';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Activity, BarChart3, CircleDollarSign, Clock3, HelpCircle, History, RefreshCw, Repeat2, Sparkles, UserRound, Users, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { LanguageSelector } from '../components/LanguageSelector';
import { PerformanceChart } from '../components/PerformanceChart';
import { StatCard } from '../components/StatCard';
import { TradeCard } from '../components/TradeCard';
import { dashboardApi } from '../lib/api';
import { formatPercentRate, formatUsdt, maskPhone } from '../lib/format';
import { loadSession } from '../lib/session';
import type { DashboardData } from '../lib/types';

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const user = loadSession()?.user;

  const load = async () => {
    setError('');
    try { setData(await dashboardApi.get()); }
    catch { setError('No pudimos actualizar tu dashboard. Comprueba tu conexión e inténtalo otra vez.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const cycle = data?.currentCycle;
  const closedTrades = useMemo(() => cycle?.trades.filter((trade) => trade.status === 'CLOSED') ?? [], [cycle]);
  const progressPercent = cycle ? (cycle.progress.closed / Math.max(1, cycle.progress.total)) * 100 : 0;

  if (loading) return <main className="app-shell"><div className="dashboard-loading"><Brand/><div className="skeleton skeleton--hero"/><div className="skeleton-grid"><div className="skeleton"/><div className="skeleton"/></div><div className="skeleton skeleton--chart"/></div></main>;

  if (!data) return <main className="app-shell"><div className="empty-state"><Brand/><Activity size={32}/><h1>{tr("No pudimos cargar tu cuenta")}</h1><p>{tr(error)}</p><button className="primary-button" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={17}/>{' '}{tr("Reintentar")}</button></div></main>;

  return <main className="app-shell">
    <header className="app-header"><Brand compact/><div className="header-actions"><LanguageSelector compact/><button className="icon-button icon-button--surface" aria-label={tr("Centro de ayuda")} title={tr("Centro de ayuda")} onClick={() => navigate('/help')}><HelpCircle size={19}/></button><button className="avatar-button" onClick={() => navigate('/profile')} aria-label={tr("Perfil y seguridad")} title={tr("Perfil y seguridad")}><span>{user?.phoneE164?.slice(-2) ?? 'AV'}</span><UserRound size={14}/></button></div></header>

    <section className="welcome"><div><span className="eyebrow">{tr("TU CUENTA")}</span><h1>{user ? maskPhone(user.phoneE164) : 'AERVON'}</h1></div><span className="live-chip"><span/>{' '}{tr("SISTEMA ACTIVO")}</span></section>

    <section className="balance-hero">
      <div className="balance-hero__head"><div><span>{tr("Balance total")}</span><strong>{formatUsdt(data.wallet.totalBalance)} <small>USDT</small></strong></div><div className="network-badge">BEP-20</div></div>
      <div className="balance-hero__chart"><PerformanceChart trades={cycle?.trades ?? []}/></div>
      <div className="balance-hero__footer"><div><span>{tr("Disponible")}</span><strong>{formatUsdt(data.wallet.availableBalance)} USDT</strong></div><div><span>{tr("Capital activo")}</span><strong>{formatUsdt(data.wallet.activePrincipal)} USDT</strong></div></div>
    </section>

    <section className="stat-grid">
      <StatCard label={tr("Ganancias")} value={`${formatUsdt(data.earnings.totalYieldEarned)} USDT`} sub={tr("Histórico de ciclos")} icon={Sparkles}/>
      <StatCard label={tr("Referidos")} value={`${formatUsdt(data.earnings.totalReferralEarned)} USDT`} sub={tr("Comisiones acumuladas")} icon={CircleDollarSign} accent="cyan"/>
    </section>

    <section className="quick-actions">
      <button onClick={() => navigate('/compound')}><Repeat2 size={18}/><span><strong>{tr("Interés compuesto")}</strong><small>{tr("Reinvertir ganancias")}</small></span></button>
      <button onClick={() => navigate('/referrals')}><Users size={18}/><span><strong>{tr("Referidos")}</strong><small>{tr("Tu red y comisiones")}</small></span></button>
      <button onClick={() => navigate('/help')}><HelpCircle size={18}/><span><strong>{tr("Centro de ayuda")}</strong><small>{tr("Cómo funciona AERVON")}</small></span></button>
    </section>

    <section className="cycle-card">
      <div className="section-heading"><div><span className="eyebrow">{tr("TRADING UNIFICADO")}</span><h2>{tr("Ciclo actual")}</h2></div><span className={`cycle-status cycle-status--${cycle?.status?.toLowerCase() ?? 'idle'}`}>{cycle?.status === 'RUNNING' ? tr('EN CURSO') : cycle?.status === 'SCHEDULED' ? tr('PROGRAMADO') : tr('SIN CICLO')}</span></div>
      {cycle ? <>
        <div className="cycle-kpis"><div><span>{tr("Rendimiento")}</span><strong className="positive">{formatPercentRate(cycle.accumulatedPnlRate)}</strong></div><div><span>{tr("Tu resultado")}</span><strong className="positive">+{formatUsdt(cycle.accumulatedPnlUsdt)} USDT</strong></div><div><span>{tr("Operaciones")}</span><strong>{cycle.progress.closed}/{cycle.progress.total}</strong></div></div>
        <div className="cycle-progress"><div><span style={{ width: `${progressPercent}%` }}/></div><small><Clock3 size={13}/>{' '}{tr("Progreso de operaciones cerradas")}</small></div>
        <PerformanceChart trades={cycle.trades}/>
      </> : <div className="inline-empty"><Clock3 size={25}/><div><strong>{tr("Próximo ciclo pendiente")}</strong><span>{tr("Cuando se programe un nuevo ciclo aparecerá aquí.")}</span></div></div>}
    </section>

    <section className="investment-card">
      <div className="section-heading"><div><span className="eyebrow">{tr("CAPITAL")}</span><h2>{tr("Periodo operativo")}</h2></div><WalletCards size={21}/></div>
      <div className="lock-row"><div className="ring" style={{ '--progress': `${Math.min(100, (data.investment.completedCycles / data.investment.minimumPrincipalCycles) * 100)}%` } as CSSProperties}><span>{data.investment.completedCycles}</span><small>/{data.investment.minimumPrincipalCycles}</small></div><div><strong>{data.investment.principalWithdrawalEligible ? tr('Principal elegible para retiro') : `${data.investment.cyclesRemaining} ${tr('ciclos restantes')}`}</strong><p>{tr("Las ganancias disponibles no dependen de este periodo mínimo del principal.")}</p></div></div>
    </section>

    <section className="trades-section"><div className="section-heading"><div><span className="eyebrow">{tr("ACTIVIDAD DEL CICLO")}</span><h2>{tr("Operaciones")}</h2></div><span className="counter-badge">{cycle?.progress.closed ?? 0}/5</span></div>
      {cycle?.trades.length ? <div className="trade-list">{cycle.trades.map((trade) => <TradeCard key={trade.id} trade={trade}/>)}</div> : <div className="inline-empty"><Activity size={25}/><div><strong>{tr("Sin operaciones todavía")}</strong><span>{tr("Las operaciones aparecerán automáticamente durante el ciclo.")}</span></div></div>}
    </section>

    {closedTrades.length > 0 && <section className="mini-history"><div className="section-heading"><div><span className="eyebrow">{tr("RESUMEN")}</span><h2>{tr("Últimos cierres")}</h2></div></div>{closedTrades.slice(-3).reverse().map((trade) => <div className="history-row" key={trade.id}><div><strong>{trade.symbol}</strong><span>{trade.side}</span></div><strong className={Number(trade.pnlRate) >= 0 ? 'positive' : 'negative'}>{formatPercentRate(trade.pnlRate)}</strong><strong className={Number(trade.pnlUsdt) >= 0 ? 'positive' : 'negative'}>{Number(trade.pnlUsdt) >= 0 ? '+' : ''}{formatUsdt(trade.pnlUsdt)} USDT</strong></div>)}</section>}

    <div className="disclosure"><Activity size={14}/><p>{tr("Actividad de trading unificado simulada, contextualizada con referencias de mercado. Los importes mostrados se calculan sobre tu capital asignado al ciclo.")}</p></div>

    <nav className="bottom-nav" aria-label={tr("Navegación principal")}><button className="active" onClick={() => navigate('/dashboard')}><Activity size={19}/><span>{tr("Inicio")}</span></button><button onClick={() => navigate('/trading')}><BarChart3 size={19}/><span>{tr("Trading")}</span></button><button onClick={() => navigate('/wallet')}><WalletCards size={19}/><span>{tr("Wallet")}</span></button><button onClick={() => navigate('/history')}><History size={19}/><span>{tr("Historial")}</span></button></nav>
  </main>;
}
