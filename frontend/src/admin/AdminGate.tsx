import { tr } from '../i18n/index';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AdminMe } from '../lib/types';
export function AdminGate({children}:{children:React.ReactNode}){
  const [state,setState]=useState<'loading'|'denied'|'ok'>('loading'); const [me,setMe]=useState<AdminMe|null>(null);
  useEffect(()=>{adminApi.me().then(v=>{setMe(v);setState('ok')}).catch(()=>setState('denied'))},[]);
  if(state==='loading') return <div className="admin-gate">{tr("Verificando permisos administrativos…")}</div>;
  if(state==='denied') return <Navigate to="/dashboard" replace/>;
  return <>{typeof children==='function' ? (children as any)(me) : children}</>;
}
