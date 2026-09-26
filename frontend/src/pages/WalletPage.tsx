import { tr } from '../i18n/index';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, ExternalLink, QrCode, RefreshCw, Send, ShieldCheck, WalletCards } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AppLayout } from '../components/AppLayout';
import { WalletAllocationChart } from '../components/WalletAllocationChart';
import { dashboardApi, depositsApi, withdrawalsApi } from '../lib/api';
import { formatDateTime, formatUsdt } from '../lib/format';
import type { DashboardData, DepositAddress, DepositItem, WithdrawalItem } from '../lib/types';

function shortHash(value?: string | null) { return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—'; }

export function WalletPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [address, setAddress] = useState<DepositAddress | null>(null);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');

  const load = async () => {
    setError('');
    try {
      const [d, a, dh, wh] = await Promise.all([dashboardApi.get(), depositsApi.address(), depositsApi.history(), withdrawalsApi.list()]);
      setDashboard(d); setAddress(a); setDeposits(dh); setWithdrawals(wh);
    } catch { setError('No pudimos actualizar la wallet.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const recent = useMemo(() => [
    ...deposits.map(x => ({ kind:'DEPÓSITO', amount:x.amount, status:x.status, date:x.creditedAt, ref:x.txHash, positive:true })),
    ...withdrawals.map(x => ({ kind:'RETIRO', amount:x.amount, status:x.status, date:x.requestedAt, ref:x.txHash, positive:false })),
  ].sort((a,b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()).slice(0, 8), [deposits, withdrawals]);

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address.address);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const submitWithdrawal = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(''); setSubmitting(true);
    try {
      const key = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const row = await withdrawalsApi.request(amount, destination, key);
      setSuccess(`${tr('Retiro solicitado')} (${tr(row.status)})`); setAmount(''); setDestination('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo solicitar el retiro.'); }
    finally { setSubmitting(false); }
  };

  return <AppLayout title={tr("Wallet")} subtitle="USDT · BNB SMART CHAIN">
    {loading ? <><div className="skeleton skeleton--hero"/><div className="skeleton skeleton--chart"/></> : !dashboard || !address ? <section className="panel-state"><WalletCards size={28}/><strong>{tr("No pudimos cargar tu wallet")}</strong><p>{tr(error)}</p><button className="secondary-button" onClick={() => {setLoading(true); void load();}}><RefreshCw size={16}/>{' '}{tr("Reintentar")}</button></section> : <>
      <section className="wallet-summary">
        <div><span>{tr("Balance total")}</span><strong>{formatUsdt(dashboard.wallet.totalBalance)} <small>USDT</small></strong><p>{formatUsdt(dashboard.wallet.availableBalance)}{' '}{tr("USDT disponibles")}</p></div>
        <WalletAllocationChart wallet={dashboard.wallet}/>
      </section>

      <div className="wallet-tabs"><button className={tab === 'deposit' ? 'active' : ''} onClick={() => setTab('deposit')}>{tr("Depositar")}</button><button className={tab === 'withdraw' ? 'active' : ''} onClick={() => setTab('withdraw')}>{tr("Retirar")}</button></div>

      {tab === 'deposit' ? <section className="wallet-action-card">
        <div className="section-heading"><div><span className="eyebrow">{tr("RECIBIR USDT")}</span><h2>{tr("Tu dirección BEP-20")}</h2></div><QrCode size={22}/></div>
        <div className="qr-placeholder qr-placeholder--real"><QRCodeSVG value={address.address} size={118} bgColor="#0b2028" fgColor="#e8fff6" level="M" includeMargin={false}/><span>USDT · BEP-20</span></div>
        <div className="address-box"><code>{address.address}</code><button onClick={copy}>{copied ? <Check size={17}/> : <Copy size={17}/>}</button></div>
        <div className="info-grid"><div><span>{tr("Red")}</span><strong>BNB Smart Chain</strong></div><div><span>{tr("Mínimo")}</span><strong>{address.minDeposit} USDT</strong></div></div>
        <div className="security-note"><ShieldCheck size={17}/><p>{tr("Envía únicamente USDT mediante BEP-20 a esta dirección. Los depósitos confirmados se acreditan automáticamente.")}</p></div>
      </section> : <section className="wallet-action-card">
        <div className="section-heading"><div><span className="eyebrow">{tr("ENVIAR USDT")}</span><h2>{tr("Solicitar retiro")}</h2></div><Send size={22}/></div>
        <div className="available-banner"><span>{tr("Disponible")}</span><strong>{formatUsdt(dashboard.wallet.availableBalance)} USDT</strong></div>
        <form className="withdraw-form" onSubmit={submitWithdrawal}>
          <label className="field"><span className="field__label">{tr("Monto")}</span><span className="field__control"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10.00"/><b>USDT</b></span></label>
          <label className="field"><span className="field__label">{tr("Dirección BEP-20")}</span><span className="field__control"><input value={destination} onChange={e => setDestination(e.target.value.trim())} placeholder="0x..."/></span></label>
          <small className="form-hint">{tr("Retiro mínimo: 10 USDT. El sistema procesa automáticamente cuando la wallet operativa dispone de USDT y BNB suficiente para el gas.")}</small>
          {error && <div className="form-message form-message--error">{tr(error)}</div>}{success && <div className="form-message form-message--success">{tr(success)}</div>}
          <button className="primary-button" disabled={submitting}>{submitting ? tr("Procesando…") : tr("Solicitar retiro")} <Send size={16}/></button>
        </form>
      </section>}

      <section className="wallet-history"><div className="section-heading"><div><span className="eyebrow">{tr("MOVIMIENTOS")}</span><h2>{tr("Actividad reciente")}</h2></div></div>{recent.length ? recent.map((x, i) => <div className="wallet-history-row" key={`${x.kind}-${i}-${x.ref}`}><div className={x.positive ? 'move-icon move-icon--in' : 'move-icon move-icon--out'}>{x.positive ? '↓' : '↑'}</div><div className="wallet-history-row__main"><strong>{tr(x.kind)}</strong><span>{formatDateTime(x.date)} · {tr(x.status)}</span></div><div className="wallet-history-row__value"><strong className={x.positive ? 'positive' : ''}>{x.positive ? '+' : '-'}{formatUsdt(x.amount)} USDT</strong><span>{shortHash(x.ref)} {x.ref && <ExternalLink size={10}/>}</span></div></div>) : <div className="inline-empty"><WalletCards size={24}/><div><strong>{tr("Sin movimientos")}</strong><span>{tr("Tus depósitos y retiros aparecerán aquí.")}</span></div></div>}</section>
    </>}
  </AppLayout>;
}
