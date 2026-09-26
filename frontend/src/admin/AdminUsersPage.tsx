import { getLanguage } from '../i18n';
import { tr } from '../i18n/index';
import { useEffect, useState } from 'react';
import { Search, ShieldAlert, UserRound, X } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { AdminUserListItem } from '../lib/types';
import { AdminLayout } from './AdminLayout';
import { AdminHeading, Status, money } from './AdminCommon';

export function AdminUsersPage(){
 const [q,setQ]=useState(''); const [items,setItems]=useState<AdminUserListItem[]>([]); const [total,setTotal]=useState(0); const [selected,setSelected]=useState<any>(null); const [error,setError]=useState('');
 async function load(){try{const r=await adminApi.users(new URLSearchParams({limit:'50',...(q?{q}:{} as any)}).toString());setItems(r.items);setTotal(r.total)}catch(e:any){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function open(id:string){try{setSelected(await adminApi.user(id))}catch(e:any){setError(e.message)}}
 async function toggleStatus(){if(!selected)return;const next=selected.user.status==='SUSPENDED'?'ACTIVE':'SUSPENDED';const reason=prompt(`${tr('Motivo para cambiar estado a')} ${next}`);if(!reason)return;await adminApi.setUserStatus(selected.user.id,next,reason);setSelected(await adminApi.user(selected.user.id));load()}
 async function adjust(direction:'CREDIT'|'DEBIT'){if(!selected)return;const amount=prompt(`${tr('Monto USDT a')} ${direction==='CREDIT'?tr('acreditar'):tr('debitar')}`);if(!amount)return;const reason=prompt(tr('Motivo obligatorio del ajuste'));if(!reason)return;await adminApi.adjustBalance(selected.user.id,amount,direction,reason);setSelected(await adminApi.user(selected.user.id))}
 return <AdminLayout><AdminHeading eyebrow="USUARIOS" title={tr("Usuarios y cuentas")} subtitle={tr("Consulta, soporte y acciones administrativas auditadas.")}/>
 <form className="admin-search" onSubmit={e=>{e.preventDefault();load()}}><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={tr("Teléfono, Telegram, código o ID")}/><button>{tr("Buscar")}</button></form>
 <div className="admin-list-meta">{total}{' '}{tr("usuarios")}</div>{error&&<div className="form-message form-message--error">{error}</div>}
 <div className="admin-table-card"><div className="admin-table admin-table--users"><div className="admin-tr admin-th"><span>{tr("Usuario")}</span><span>{tr("Estado")}</span><span>{tr("Rol")}</span><span>{tr("Registro")}</span></div>{items.map(u=><button className="admin-tr" key={u.id} onClick={()=>open(u.id)}><span><b>{u.phoneE164}</b><small>@{u.telegramUsername||tr("sin username")}</small></span><span><Status value={u.status}/></span><span>{u.adminRoles?.length?u.adminRoles.join(', '):'USER'}</span><span>{u.createdAt?new Date(u.createdAt).toLocaleDateString(getLanguage() === 'es' ? 'es-419' : 'en-US'):'—'}</span></button>)}</div></div>
 {selected&&<div className="admin-drawer-backdrop" onClick={()=>setSelected(null)}><aside className="admin-drawer" onClick={e=>e.stopPropagation()}><button className="admin-drawer-close" onClick={()=>setSelected(null)}><X size={17}/></button><div className="admin-user-head"><div className="admin-user-avatar"><UserRound/></div><div><span>{tr("Usuario")}</span><h2>{selected.user.phoneE164}</h2><Status value={selected.user.status}/></div></div>
 <div className="admin-detail-grid admin-detail-grid--wide"><div><span>{tr("Disponible")}</span><strong>{money(selected.balances?.USER_AVAILABLE)}</strong></div><div><span>{tr("Capital activo")}</span><strong>{money(selected.balances?.USER_ACTIVE_PRINCIPAL)}</strong></div><div><span>{tr("Retiro pendiente")}</span><strong>{money(selected.balances?.USER_WITHDRAWAL_PENDING)}</strong></div><div><span>{tr("Referidos ganados")}</span><strong>{money(selected.referralEarnedUsdt)}</strong></div><div><span>{tr("Ciclos")}</span><strong>{selected.investment?.completedCycles??0}</strong></div><div><span>{tr("Sesiones activas")}</span><strong>{selected.activeSessions}</strong></div></div>
 <div className="admin-action-stack"><button onClick={toggleStatus}><ShieldAlert size={15}/>{selected.user.status==='SUSPENDED'?tr("Reactivar cuenta"):tr("Suspender cuenta")}</button><button onClick={()=>adjust('CREDIT')}>{tr("Ajuste + USDT")}</button><button className="danger" onClick={()=>adjust('DEBIT')}>{tr("Ajuste - USDT")}</button></div>
 <div className="admin-subtitle">{tr("Últimos depósitos")}</div>{selected.recentDeposits?.map((d:any)=><div className="admin-mini-row" key={d.id}><span>{money(d.amount)}</span><Status value={d.status}/></div>)}
 </aside></div>}
 </AdminLayout>
}
