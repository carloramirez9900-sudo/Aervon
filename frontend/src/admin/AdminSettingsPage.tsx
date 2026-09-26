import { tr } from '../i18n/index';
import { useEffect, useState } from 'react';
import { LockKeyhole, PauseCircle, PlayCircle, ShieldCheck } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { AdminSettings } from '../lib/types';
import { AdminLayout } from './AdminLayout';
import { AdminHeading } from './AdminCommon';
export function AdminSettingsPage(){
 const [data,setData]=useState<AdminSettings|null>(null);const [error,setError]=useState('');
 async function load(){try{setData(await adminApi.settings())}catch(e:any){setError(e.message)}}useEffect(()=>{load()},[]);
 async function toggle(key:'tradingPaused'|'depositsPaused'|'withdrawalsPaused',value:boolean){const reason=prompt(`${tr('Motivo para')} ${value?tr('pausar'):tr('reanudar')} ${key}`);if(!reason)return;try{await adminApi.setOperational(key,value,reason);load()}catch(e:any){setError(e.message)}}
 return <AdminLayout><AdminHeading eyebrow="CONFIGURACIÓN" title={tr("Controles operativos")} subtitle={tr("Pausas de emergencia y reglas financieras de solo lectura.")}/>{error&&<div className="form-message form-message--error">{error}</div>}{data&&<>
 <section className="admin-panel"><div className="admin-panel__title"><ShieldCheck size={17}/><div><strong>{tr("Interruptores operativos")}</strong><span>{tr("Acciones auditadas; no alteran el historial.")}</span></div></div><div className="admin-switch-list">{Object.entries(data.operational).map(([key,value])=><div key={key}><div><strong>{key==='tradingPaused'?tr("Trading"):key==='depositsPaused'?tr("Depósitos"):tr("Retiros")}</strong><span>{value?tr("Pausado"):tr("Operativo")}</span></div><button className={value?'resume':'pause'} onClick={()=>toggle(key as any,!value)}>{value?<PlayCircle size={15}/>:<PauseCircle size={15}/>} {value?tr("Reanudar"):tr("Pausar")}</button></div>)}</div></section>
 <section className="admin-panel"><div className="admin-panel__title"><LockKeyhole size={17}/><div><strong>{tr("Reglas financieras")}</strong><span>{tr("Configuradas por despliegue; no editables desde el panel.")}</span></div></div><div className="admin-rules-grid">{Object.entries(data.financialRules).map(([k,v])=><div key={k}><span>{k}</span><strong>{String(v)}</strong></div>)}</div></section>
 </>}</AdminLayout>
}
