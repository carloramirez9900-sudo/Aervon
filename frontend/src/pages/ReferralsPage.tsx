import { tr } from '../i18n/index';
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Gift, RefreshCw, Share2, UserCheck, Users } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { ReferralCommissionChart } from '../components/ReferralCommissionChart';
import { referralsApi } from '../lib/api';
import { formatDateTime, formatUsdt } from '../lib/format';
import type { ReferralSummary } from '../lib/types';

export function ReferralsPage() {
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const load = async () => { setError(''); try { setData(await referralsApi.summary()); } catch { setError('No pudimos cargar tus referidos.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const link = useMemo(() => data ? `${window.location.origin}/register?ref=${encodeURIComponent(data.referralCode)}` : '', [data]);
  const copy = async () => { if (!link) return; await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
  const share = async () => { if (!data) return; if (navigator.share) await navigator.share({ title:'AERVON', text:'Mi invitación a AERVON', url:link }); else await copy(); };

  return <AppLayout title={tr("Referidos")} subtitle={tr("TU RED DIRECTA")}>
    {loading ? <div className="panel-state"><RefreshCw className="spin"/><strong>{tr("Cargando...")}</strong></div> : !data ? <div className="panel-state"><Users/><strong>{tr("No pudimos cargar tus referidos")}</strong><p>{tr(error)}</p><button className="secondary-button" onClick={() => { setLoading(true); void load(); }}>{tr("Reintentar")}</button></div> : <>
      <section className="referral-hero">
        <div className="referral-hero__top"><div><span>{tr("Comisiones acumuladas")}</span><strong>{formatUsdt(data.totalCommission)} <small>USDT</small></strong></div><div className="referral-rate"><span>{tr("Comisión")}</span><strong>{data.commissionRate}%</strong></div></div>
        <div className="referral-chart"><ReferralCommissionChart commissions={data.commissions}/></div>
      </section>

      <section className="referral-stats"><div><Users/><span>{tr("Directos")}</span><strong>{data.directReferrals}</strong></div><div><UserCheck/><span>{tr("Activos")}</span><strong>{data.activeReferrals}</strong></div><div><Gift/><span>{tr("Nivel")}</span><strong>1</strong></div></section>

      <section className="referral-link-card"><div className="section-heading"><div><span className="eyebrow">{tr("INVITAR")}</span><h2>{tr("Tu enlace personal")}</h2></div><Share2 size={19}/></div><div className="referral-code"><span>{tr("Código")}</span><strong>{data.referralCode}</strong></div><div className="address-box"><code>{link}</code><button onClick={() => void copy()} aria-label={tr("Copiar enlace")}>{copied ? <Check size={17}/> : <Copy size={17}/>}</button></div><button className="primary-button" onClick={() => void share()}><Share2 size={17}/>{' '}{tr("Compartir invitación")}</button><p className="referral-note">{tr("Recibes")}{' '}{data.commissionRate}{tr("% de la ganancia generada por tu referido directo. La comisión se acredita a tu saldo disponible y no reduce la ganancia del referido.")}</p></section>

      <section className="referral-list-card"><div className="section-heading"><div><span className="eyebrow">{tr("RED")}</span><h2>{tr("Referidos directos")}</h2></div></div>{data.referrals.length ? data.referrals.map((item) => <div className="referral-row" key={item.id}><div className={item.active ? 'referral-avatar active' : 'referral-avatar'}><Users size={15}/></div><div><strong>{item.phone}</strong><span>{formatDateTime(item.joinedAt)}</span></div><span className={item.active ? 'status-pill status-pill--active' : 'status-pill'}>{item.active ? tr("ACTIVO") : tr("REGISTRADO")}</span></div>) : <div className="inline-empty"><Users size={24}/><div><strong>{tr("Aún no tienes referidos")}</strong><span>{tr("Comparte tu enlace para empezar.")}</span></div></div>}</section>

      <section className="referral-list-card"><div className="section-heading"><div><span className="eyebrow">{tr("COMISIONES")}</span><h2>{tr("Historial")}</h2></div></div>{data.commissions.length ? data.commissions.slice(0,20).map((item) => <div className="commission-row" key={item.id}><div><strong>{item.referredPhone}</strong><span>{formatDateTime(item.createdAt)} · {item.rate}%</span></div><div><strong className="positive">+{formatUsdt(item.amount)} USDT</strong><span>{tr("Base")}{' '}{formatUsdt(item.baseProfit)} USDT</span></div></div>) : <div className="inline-empty"><Gift size={24}/><div><strong>{tr("Sin comisiones todavía")}</strong><span>{tr("Aparecerán cuando un referido genere una ganancia elegible.")}</span></div></div>}</section>
    </>}
  </AppLayout>;
}
