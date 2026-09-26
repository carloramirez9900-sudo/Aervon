import { tr } from '../i18n/index';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, RefreshCw, Repeat2, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { ApiError, investmentsApi } from '../lib/api';
import { formatUsdt } from '../lib/format';
import type { InvestmentOverview } from '../lib/types';

function commandKey() { return `compound-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`; }

export function CompoundPage() {
  const [data, setData] = useState<InvestmentOverview | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => { setError(''); try { setData(await investmentsApi.get()); } catch { setError('No pudimos cargar la configuración de reinversión.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);

  const changeMode = async (mode: 'MANUAL' | 'AUTOMATIC') => {
    if (!data || data.compoundMode === mode) return;
    setSaving(true); setError(''); setSuccess('');
    try { await investmentsApi.setCompoundMode(mode); setData({ ...data, compoundMode: mode }); setSuccess(mode === 'AUTOMATIC' ? 'Reinversión automática activada para próximos ciclos.' : 'Reinversión automática desactivada.'); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'No pudimos cambiar el modo.'); }
    finally { setSaving(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!data) return;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return setError('Introduce un monto válido.');
    if (numeric > Number(data.availableBalance)) return setError('El monto supera tu saldo disponible.');
    setSaving(true); setError(''); setSuccess('');
    try { const next = await investmentsApi.compound(amount, commandKey()); setData(next); setAmount(''); setSuccess('Reinversión programada para el próximo ciclo.'); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'No pudimos programar la reinversión.'); }
    finally { setSaving(false); }
  };

  return <AppLayout title={tr("Interés compuesto")} subtitle={tr("CRECIMIENTO DEL CAPITAL")}>
    {loading ? <div className="panel-state"><RefreshCw className="spin"/><strong>{tr("Cargando...")}</strong></div> : !data ? <div className="panel-state"><Repeat2/><strong>{tr("Información no disponible")}</strong><p>{tr(error)}</p><button className="secondary-button" onClick={() => { setLoading(true); void load(); }}>{tr("Reintentar")}</button></div> : <>
      <section className="compound-hero">
        <div><span className="eyebrow">{tr("PRÓXIMO CICLO")}</span><h2>{formatUsdt(data.activePrincipal)} <small>USDT</small></h2><p>{tr("Capital actualmente activo")}</p></div>
        <div className="compound-flow"><div><span>{tr("Disponible")}</span><strong>{formatUsdt(data.availableBalance)}</strong></div><ArrowRight/><div><span>{tr("Pendiente")}</span><strong>{formatUsdt(data.pendingCompound)}</strong></div></div>
      </section>

      <section className="compound-mode-card">
        <div className="section-heading"><div><span className="eyebrow">{tr("MODO")}</span><h2>{tr("Cómo reinvertir")}</h2></div><Repeat2 size={20}/></div>
        <div className="mode-grid">
          <button className={data.compoundMode === 'MANUAL' ? 'mode-option active' : 'mode-option'} onClick={() => void changeMode('MANUAL')} disabled={saving}><span>{tr("Manual")}</span><small>{tr("Tú decides cuánto pasar al siguiente ciclo.")}</small>{data.compoundMode === 'MANUAL' && <CheckCircle2/>}</button>
          <button className={data.compoundMode === 'AUTOMATIC' ? 'mode-option active' : 'mode-option'} onClick={() => void changeMode('AUTOMATIC')} disabled={saving}><span>{tr("Automático")}</span><small>{tr("La ganancia de cada ciclo se programa para el siguiente.")}</small>{data.compoundMode === 'AUTOMATIC' && <CheckCircle2/>}</button>
        </div>
      </section>

      <section className="compound-form-card">
        <div className="section-heading"><div><span className="eyebrow">{tr("REINVERSIÓN MANUAL")}</span><h2>{tr("Programar monto")}</h2></div><WalletCards size={20}/></div>
        <form onSubmit={submit} className="withdraw-form">
          <label className="field"><span className="field__label">{tr("Monto a reinvertir")}</span><span className="field__control"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"/><b>USDT</b></span></label>
          <div className="compound-preview"><Sparkles size={17}/><div><span>{tr("Capital estimado para el próximo ciclo")}</span><strong>{formatUsdt(Number(data.activePrincipal) + Number(data.pendingCompound) + (Number(amount) || 0))} USDT</strong></div></div>
          {error && <div className="form-message form-message--error">{tr(error)}</div>}{success && <div className="form-message form-message--success">{tr(success)}</div>}
          <button className="primary-button" disabled={saving || data.position.status === 'NOT_ACTIVE'}>{saving ? tr("Procesando…") : tr("Reinvertir en próximo ciclo")}</button>
        </form>
      </section>

      <div className="security-note"><ShieldCheck size={17}/><p>{tr("La reinversión nunca modifica un ciclo que ya comenzó. El monto pendiente se incorpora al capital al iniciar el próximo ciclo elegible.")}</p></div>
    </>}
  </AppLayout>;
}
