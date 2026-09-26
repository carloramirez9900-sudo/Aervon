import { tr } from '../i18n/index';
import { useMemo, useState } from 'react';
import { ChevronDown, CircleDollarSign, HelpCircle, LockKeyhole, RefreshCcw, Search, ShieldCheck, Users, WalletCards, Waves } from 'lucide-react';
import { useLanguage } from '../i18n';
import { AppLayout } from '../components/AppLayout';

const sections = [
  { id:'aervon', icon:Waves, title:'Cómo funciona AERVON', body:'AERVON organiza la participación en ciclos globales de 24 horas. El dashboard reúne tu capital activo, saldo disponible, evolución del ciclo y actividad unificada para que puedas seguir todo desde una sola interfaz.' },
  { id:'trading', icon:RefreshCcw, title:'Trading unificado', body:'Todos los participantes de un mismo ciclo visualizan la misma secuencia de 5 operaciones. Esta actividad es simulada y se contextualiza con referencias de mercado; no representa órdenes individuales ejecutadas con el capital de cada usuario en un exchange.' },
  { id:'cycles', icon:Waves, title:'Ciclos y operaciones', body:'Cada ciclo dura 24 horas y contiene 5 operaciones. Si activas el trading cuando un ciclo ya comenzó, tu capital entra en el próximo ciclo completo. Las operaciones muestran apertura, cierre, dirección, PnL porcentual y resultado equivalente en USDT para tu capital asignado.' },
  { id:'profits', icon:CircleDollarSign, title:'Ganancias y PnL', body:'Al finalizar un ciclo, la ganancia acreditada pasa a saldo disponible salvo que tengas activada la reinversión automática. En cada operación se muestra el PnL porcentual y su equivalencia en USDT sobre tu principal de ese ciclo.' },
  { id:'compound', icon:RefreshCcw, title:'Interés compuesto', body:'Puedes reinvertir manualmente un monto disponible o activar el modo automático. Toda reinversión entra en el siguiente ciclo elegible; nunca modifica retroactivamente un ciclo que ya está en curso.' },
  { id:'deposits', icon:WalletCards, title:'Depósitos', body:'Los depósitos se realizan en USDT sobre BNB Smart Chain (BEP-20). Cada usuario tiene una dirección de depósito única. El mínimo de depósito es 5 USDT. Verifica siempre red, token y dirección antes de enviar fondos.' },
  { id:'withdrawals', icon:WalletCards, title:'Retiros', body:'El retiro mínimo es 10 USDT. Las ganancias y comisiones disponibles pueden retirarse según el saldo. El principal requiere un mínimo de 10 ciclos completos antes de ser elegible y, si hay un ciclo activo, se libera al terminarlo.' },
  { id:'referrals', icon:Users, title:'Referidos', body:'El programa inicial tiene un solo nivel directo. Recibes 3% de la ganancia elegible generada por tu referido. Esa comisión se acredita a tu saldo disponible y no se descuenta de la ganancia del referido.' },
  { id:'security', icon:ShieldCheck, title:'Seguridad', body:'El acceso utiliza teléfono, contraseña y verificación de teléfono mediante Telegram durante el registro. Nunca compartas tu contraseña, seed phrase, private keys ni códigos privados. AERVON no debe pedirte esos secretos por chat.' },
  { id:'faq', icon:HelpCircle, title:'Preguntas frecuentes', body:'¿Cuándo empiezo? En el próximo ciclo completo tras activar. ¿Cuántas operaciones hay? 5 por ciclo. ¿Puedo retirar ganancias? Sí, cuando estén en saldo disponible y cumplas el mínimo de retiro. ¿Puedo reinvertir? Sí, manual o automáticamente para el siguiente ciclo.' },
];

export function HelpCenterPage() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState('aervon');
  const language = useLanguage();
  const filtered = useMemo(() => sections.filter((item) => `${tr(item.title)} ${tr(item.body)}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <AppLayout title={tr("Centro de ayuda")} subtitle={tr("APRENDE A USAR AERVON")}>
    <section className="help-hero"><LockKeyhole size={23}/><div><strong>{tr("Todo lo esencial, en un solo lugar")}</strong><span>{tr("Consulta cómo funcionan ciclos, capital, wallet, reinversión, referidos y seguridad.")}</span></div></section>
    <label className="help-search"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Buscar en el centro de ayuda…")}/></label>
    <section className="help-list">{filtered.map(({ id, icon:Icon, title, body }) => <article className={open === id ? 'help-item open' : 'help-item'} key={id}><button onClick={() => setOpen(open === id ? '' : id)}><span className="help-item__icon"><Icon size={17}/></span><strong>{tr(title)}</strong><ChevronDown size={17}/></button>{open === id && <div className="help-item__body"><p>{tr(body)}</p></div>}</article>)}</section>
    {!filtered.length && <div className="panel-state panel-state--compact"><Search/><strong>{tr("No encontramos resultados")}</strong><p>{tr("Prueba otra palabra o revisa las categorías disponibles.")}</p></div>}
    <div className="security-note"><ShieldCheck size={17}/><p>{tr("Las explicaciones del Centro de Ayuda describen el funcionamiento del producto. Las condiciones legales y políticas de privacidad deben consultarse también en sus documentos correspondientes cuando estén publicados.")}</p></div>
  </AppLayout>;
}
