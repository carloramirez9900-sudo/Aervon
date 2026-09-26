import { tr } from '../i18n/index';
import type { PropsWithChildren } from 'react';
import { Activity, BarChart3, HelpCircle, History, UserRound, WalletCards } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Brand } from './Brand';
import { LanguageSelector } from './LanguageSelector';
import { loadSession } from '../lib/session';

type Props = PropsWithChildren<{ title?: string; subtitle?: string }>;

const nav = [
  { path: '/dashboard', label: 'Inicio', icon: Activity },
  { path: '/trading', label: 'Trading', icon: BarChart3 },
  { path: '/wallet', label: 'Wallet', icon: WalletCards },
  { path: '/history', label: 'Historial', icon: History },
];

export function AppLayout({ children, title, subtitle }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = loadSession()?.user;

  return (
    <main className="app-shell">
      <header className="app-header">
        <Brand compact />
        <div className="header-actions">
          <LanguageSelector compact/>
          <button className="icon-button icon-button--surface" aria-label={tr("Centro de ayuda")} title={tr("Centro de ayuda")} onClick={() => navigate('/help')}>
            <HelpCircle size={19} />
          </button>
          <button className="avatar-button" onClick={() => navigate('/profile')} aria-label={tr("Perfil y seguridad")} title={tr("Perfil y seguridad")}>
            <span>{user?.phoneE164?.slice(-2) ?? 'AV'}</span><UserRound size={14} />
          </button>
        </div>
      </header>

      {(title || subtitle) && <section className="page-heading">
        {subtitle && <span className="eyebrow">{subtitle}</span>}
        {title && <h1>{title}</h1>}
      </section>}

      {children}

      <nav className="bottom-nav" aria-label={tr("Navegación principal")}>
        {nav.map(({ path, label, icon: Icon }) => (
          <button key={path} className={location.pathname === path ? 'active' : ''} onClick={() => navigate(path)}>
            <Icon size={19} /><span>{tr(label)}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
