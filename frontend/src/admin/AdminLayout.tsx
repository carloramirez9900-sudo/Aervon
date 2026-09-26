import { tr } from '../i18n/index';
import type { PropsWithChildren } from 'react';
import { Activity, Banknote, ClipboardList, Gauge, Settings2, ShieldCheck, Users, LogOut, ArrowLeftRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { LanguageSelector } from '../components/LanguageSelector';
import { authApi } from '../lib/api';
import { clearSession } from '../lib/session';

const nav = [
  {path:'/admin', label:'Resumen', icon:Gauge},
  {path:'/admin/users', label:'Usuarios', icon:Users},
  {path:'/admin/finance', label:'Finanzas', icon:Banknote},
  {path:'/admin/operations', label:'Operaciones', icon:Activity},
  {path:'/admin/settings', label:'Configuración', icon:Settings2},
  {path:'/admin/audit', label:'Auditoría', icon:ClipboardList},
];
export function AdminLayout({children}:{children:React.ReactNode}) {
  const location=useLocation(); const navigate=useNavigate();
  async function logout(){ try{await authApi.logout();}finally{clearSession();navigate('/login',{replace:true});} }
  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <Brand compact/>
      <LanguageSelector compact/>
      <div className="admin-badge"><ShieldCheck size={14}/>{tr("Panel administrativo")}</div>
      <nav>{nav.map(({path,label,icon:Icon})=><button key={path} className={location.pathname===path?'active':''} onClick={()=>navigate(path)}><Icon size={17}/><span>{tr(label)}</span></button>)}</nav>
      <button className="admin-back" onClick={()=>navigate('/dashboard')}><ArrowLeftRight size={16}/>{tr("Área de usuario")}</button>
      <button className="admin-logout" onClick={logout}><LogOut size={16}/>{tr("Cerrar sesión")}</button>
    </aside>
    <section className="admin-content"><div className="admin-mobile-language"><span>{tr("Idioma")}</span><LanguageSelector compact/></div>{children}</section>
    <nav className="admin-mobile-nav">{nav.slice(0,5).map(({path,label,icon:Icon})=><button key={path} className={location.pathname===path?'active':''} onClick={()=>navigate(path)}><Icon size={18}/><span>{tr(label)}</span></button>)}</nav>
  </main>
}
