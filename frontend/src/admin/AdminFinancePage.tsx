import { tr } from '../i18n/index';
import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { AdminDeposit, AdminWithdrawal } from '../lib/types';
import { AdminLayout } from './AdminLayout';
import { AdminHeading, Status, money } from './AdminCommon';
export function AdminFinancePage(){
 const [tab,setTab]=useState<'withdrawals'|'deposits'>('withdrawals');const [q,setQ]=useState('');const [withdrawals,setWithdrawals]=useState<AdminWithdrawal[]>([]);const [deposits,setDeposits]=useState<AdminDeposit[]>([]);const [error,setError]=useState('');
 async function load(){try{if(tab==='withdrawals'){setWithdrawals((await adminApi.withdrawals(new URLSearchParams({limit:'50',...(q?{q}:{} as any)}).toString())).items)}else setDeposits((await adminApi.deposits(new URLSearchParams({limit:'50',...(q?{q}:{} as any)}).toString())).items)}catch(e:any){setError(e.message)}}
 useEffect(()=>{load()},[tab]);
 async function action(id:string,a:'hold'|'release-hold'|'cancel'){const reason=prompt(tr('Motivo obligatorio'));if(!reason)return;try{await adminApi.withdrawalAction(id,a,reason);load()}catch(e:any){setError(e.message)}}
 return <AdminLayout><AdminHeading eyebrow="FINANZAS" title={tr("Depósitos y retiros")} subtitle={tr("Seguimiento on-chain y resolución de excepciones.")}/>
 <div className="admin-tabs"><button className={tab==='withdrawals'?'active':''} onClick={()=>setTab('withdrawals')}><ArrowUpFromLine size={14}/>{tr("Retiros")}</button><button className={tab==='deposits'?'active':''} onClick={()=>setTab('deposits')}><ArrowDownToLine size={14}/>{tr("Depósitos")}</button></div>
 <form className="admin-search" onSubmit={e=>{e.preventDefault();load()}}><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={tr("Tx hash, dirección o ID")}/><button>{tr("Buscar")}</button></form>{error&&<div className="form-message form-message--error">{error}</div>}
 {tab==='withdrawals'?<div className="admin-cards-list">{withdrawals.map(w=><article className="admin-finance-row" key={w.id}><div><span>{tr("Retiro")}</span><strong>{money(w.amount)}</strong><small>{w.destination}</small></div><div><Status value={w.status}/><small>{w.requestedAt?new Date(w.requestedAt).toLocaleString():'—'}</small></div><div className="admin-row-actions">{w.status==='SECURITY_HOLD'?<button onClick={()=>action(w.id,'release-hold')}>{tr("Liberar")}</button>:<button onClick={()=>action(w.id,'hold')}>Hold</button>}<button className="danger" onClick={()=>action(w.id,'cancel')}>{tr("Cancelar")}</button></div></article>)}</div>:<div className="admin-cards-list">{deposits.map(d=><article className="admin-finance-row" key={d.id}><div><span>{tr("Depósito")}</span><strong>{money(d.amount)}</strong><small>{d.txHash}</small></div><div><Status value={d.status}/><small>{d.createdAt?new Date(d.createdAt).toLocaleString():'—'}</small></div></article>)}</div>}
 </AdminLayout>
}
