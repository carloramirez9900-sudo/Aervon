import { getLanguage } from '../i18n';
import { tr } from '../i18n/index';
import { useEffect, useState } from 'react';
import { Activity, Database, RadioTower, RefreshCw, Users, WalletCards } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { AdminDashboard } from '../lib/types';
import { AdminLayout } from './AdminLayout';
import { AdminHeading, Metric, Status, money } from './AdminCommon';

export function AdminDashboardPage(){
 const [data,setData]=useState<AdminDashboard|null>(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError('');try{setData(await adminApi.dashboard())}catch(e:any){setError(e.message||'No se pudo cargar')}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 return <AdminLayout><AdminHeading eyebrow="AERVON CONTROL" title={tr("Resumen operativo")} subtitle={tr("Salud de la plataforma, liquidez, usuarios y ciclo actual.")}/>
   <div className="admin-toolbar"><button onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'spin':''}/>{tr("Actualizar")}</button>{data&&<small>{tr("Actualizado")}{' '}{new Date(data.generatedAt).toLocaleTimeString(getLanguage() === 'es' ? 'es-419' : 'en-US')}</small>}</div>
   {error&&<div className="form-message form-message--error">{error}</div>}
   {!data?<div className="admin-loading">{loading?tr("Cargando métricas…"):tr("Sin datos")}</div>:<>
   <section className="admin-metrics-grid">
    <Metric label={tr("Usuarios")} value={data.users.total} detail={`${data.users.active} ${tr('activos')}`}/><Metric label={tr("Capital activo")} value={money(data.finance.activePrincipalUsdt)}/>
    <Metric label={tr("Depósitos hoy")} value={money(data.finance.depositsTodayUsdt)} tone="good"/><Metric label={tr("Retiros hoy")} value={money(data.finance.withdrawalsTodayUsdt)}/>
    <Metric label={tr("Retiros pendientes")} value={data.withdrawals.pending} detail={`${data.withdrawals.securityHold} ${tr('en hold')}`} tone={data.withdrawals.securityHold?'warn':'normal'}/><Metric label={tr("Saldo disponible usuarios")} value={money(data.finance.availableBalanceUsdt)}/>
   </section>
   <section className="admin-two-col">
    <article className="admin-panel"><div className="admin-panel__title"><Activity size={17}/><div><strong>{tr("Ciclo actual")}</strong><span>{tr("Trading unificado")}</span></div></div>
      {data.cycle?<><div className="admin-cycle-kpi"><strong>{data.cycle.closedTrades}/{data.cycle.expectedTrades}</strong><span>{tr("operaciones cerradas")}</span></div><div className="admin-progress"><i style={{width:`${Math.min(100,data.cycle.closedTrades/data.cycle.expectedTrades*100)}%`}}/></div><div className="admin-detail-grid"><div><span>{tr("Estado")}</span><Status value={data.cycle.status}/></div><div><span>{tr("PnL acumulado")}</span><strong className="positive">+{data.cycle.accumulatedPnlRate}%</strong></div><div><span>{tr("Yield final")}</span><strong>{data.cycle.yieldRate?`${data.cycle.yieldRate}%`:'—'}</strong></div><div><span>{tr("Abiertas")}</span><strong>{data.cycle.openTrades}</strong></div></div></>:<div className="admin-empty">{tr("No hay ciclo activo.")}</div>}
    </article>
    <article className="admin-panel"><div className="admin-panel__title"><WalletCards size={17}/><div><strong>{tr("Wallet operativa")}</strong><span>USDT BEP-20</span></div></div>
      <div className="admin-wallet-value">{data.wallet.usdt?money(data.wallet.usdt):tr("No disponible")}</div><div className="admin-wallet-address">{data.wallet.address||tr("Wallet no configurada")}</div>
      <div className="admin-detail-grid"><div><span>{tr("USDT reservado")}</span><strong>{money(data.finance.withdrawalReservedUsdt)}</strong></div><div><span>{tr("Esperando liquidez")}</span><strong>{data.withdrawals.waitingLiquidity}</strong></div><div><span>{tr("Esperando gas")}</span><strong>{data.withdrawals.waitingGas}</strong></div><div><span>BSC RPC</span><Status value={data.services.bscRpc}/></div></div>
    </article>
   </section>
   <section className="admin-panel"><div className="admin-panel__title"><RadioTower size={17}/><div><strong>{tr("Servicios")}</strong><span>{tr("Estado de infraestructura")}</span></div></div><div className="admin-service-grid"><div><Database size={16}/><span>MongoDB Atlas</span><Status value={data.services.mongodb}/></div><div><RadioTower size={16}/><span>BSC RPC</span><Status value={data.services.bscRpc}/></div><div><Users size={16}/><span>Telegram Bot</span><Status value={data.services.telegramConfigured}/></div></div></section>
   </>}
 </AdminLayout>
}
