import { getLanguage } from '../i18n';
import { tr } from '../i18n/index';
import { useEffect, useState } from 'react';
import { Activity, Network, RefreshCw } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { AdminCycle, AdminInvestment } from '../lib/types';
import { AdminLayout } from './AdminLayout';
import { AdminHeading, Status } from './AdminCommon';

export function AdminOperationsPage(){
 const [cycles,setCycles]=useState<AdminCycle[]>([]);const [investments,setInvestments]=useState<AdminInvestment[]>([]);const [referrals,setReferrals]=useState<any>(null);const [tab,setTab]=useState<'cycles'|'investments'|'referrals'>('cycles');const [error,setError]=useState('');
 async function load(){try{const [c,i,r]=await Promise.all([adminApi.cycles('limit=25'),adminApi.investments('limit=25'),adminApi.referrals()]);setCycles(c.items);setInvestments(i.items);setReferrals(r)}catch(e:any){setError(e.message)}} useEffect(()=>{load()},[]);
 return <AdminLayout><AdminHeading eyebrow="OPERACIONES" title={tr("Motor y ciclos")} subtitle={tr("Trading unificado, inversiones y programa de referidos.")}/>
 <div className="admin-toolbar"><button onClick={load}><RefreshCw size={14}/>{tr("Actualizar")}</button></div>
 <div className="admin-tabs admin-tabs--three"><button className={tab==='cycles'?'active':''} onClick={()=>setTab('cycles')}><Activity size={14}/>{tr("Ciclos")}</button><button className={tab==='investments'?'active':''} onClick={()=>setTab('investments')}><Network size={14}/>{tr("Inversiones")}</button><button className={tab==='referrals'?'active':''} onClick={()=>setTab('referrals')}>{tr("Referidos")}</button></div>{error&&<div className="form-message form-message--error">{error}</div>}
 {tab==='cycles'&&<div className="admin-cards-list">{cycles.map(c=><article className="admin-cycle-row" key={c.id}><header><div><span>{tr("Ciclo #")}{c.sequence}</span><strong>{c.yieldRate?`${c.yieldRate}%`:tr("En progreso")}</strong></div><Status value={c.status}/></header><div className="admin-cycle-strip">{c.trades.map(t=><div key={t.id} className={t.status==='CLOSED'?'done':t.status==='OPEN'?'open':''}><b>{t.sequence}</b><span>{t.symbol}</span><small>{t.pnlRate?`${Number(t.pnlRate)>=0?'+':''}${t.pnlRate}%`:t.status}</small></div>)}</div><footer><span>{c.participants}{' '}{tr("participantes")}</span><span>{new Date(c.startsAt).toLocaleDateString(getLanguage() === 'es' ? 'es-419' : 'en-US')} → {new Date(c.endsAt).toLocaleDateString(getLanguage() === 'es' ? 'es-419' : 'en-US')}</span></footer></article>)}</div>}
 {tab==='investments'&&<div className="admin-table-card"><div className="admin-table"><div className="admin-tr admin-th"><span>{tr("Usuario")}</span><span>{tr("Estado")}</span><span>{tr("Ciclos")}</span><span>{tr("Principal")}</span></div>{investments.map(i=><div className="admin-tr" key={i.id}><span>{i.userId.slice(-8)}</span><span><Status value={i.status}/></span><span>{i.completedCycles}/10</span><span>{i.principalWithdrawalEligible?tr("Elegible"):tr("Bloqueado")}</span></div>)}</div></div>}
 {tab==='referrals'&&referrals&&<section className="admin-metrics-grid"><div className="admin-metric"><span>{tr("Comisión")}</span><strong>{referrals.commissionRate}%</strong></div><div className="admin-metric"><span>{tr("Comisiones pagadas")}</span><strong>{Number(referrals.totalCommissionsUsdt).toLocaleString()} USDT</strong></div><div className="admin-metric"><span>{tr("Eventos")}</span><strong>{referrals.commissionEvents}</strong></div><div className="admin-metric"><span>{tr("Patrocinadores")}</span><strong>{referrals.uniqueReferrers}</strong></div><div className="admin-metric"><span>{tr("Referidos con comisión")}</span><strong>{referrals.uniqueReferredUsers}</strong></div></section>}
 </AdminLayout>
}
