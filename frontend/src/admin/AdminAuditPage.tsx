import { getLanguage } from '../i18n';
import { tr } from '../i18n/index';
import { useEffect, useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { AdminAuditItem } from '../lib/types';
import { AdminLayout } from './AdminLayout';
import { AdminHeading } from './AdminCommon';
export function AdminAuditPage(){const [items,setItems]=useState<AdminAuditItem[]>([]);const [action,setAction]=useState('');const [error,setError]=useState('');async function load(){try{setItems((await adminApi.audit(new URLSearchParams({limit:'100',...(action?{action}:{} as any)}).toString())).items)}catch(e:any){setError(e.message)}}useEffect(()=>{load()},[]);return <AdminLayout><AdminHeading eyebrow="AUDITORÍA" title={tr("Registro administrativo")} subtitle={tr("Historial inmutable de acciones sensibles y cambios operativos.")}/><form className="admin-search" onSubmit={e=>{e.preventDefault();load()}}><Search size={15}/><input value={action} onChange={e=>setAction(e.target.value)} placeholder={tr("Filtrar por acción exacta")}/><button>{tr("Filtrar")}</button></form>{error&&<div className="form-message form-message--error">{error}</div>}<div className="admin-audit-list">{items.map((a,i)=><article key={a._id||`${a.action}-${i}`}><div className="admin-audit-icon"><ClipboardList size={15}/></div><div><strong>{a.action}</strong><span>{a.targetType}{a.targetId?` · ${a.targetId}`:''}</span><small>{a.reason||tr('Sin motivo registrado')}</small></div><time>{a.createdAt?new Date(a.createdAt).toLocaleString(getLanguage() === 'es' ? 'es-419' : 'en-US'):'—'}</time></article>)}</div></AdminLayout>}
