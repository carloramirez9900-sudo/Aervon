import type { PropsWithChildren } from 'react';
import { Brand } from './Brand';
import { LanguageSelector } from './LanguageSelector';

export function AuthShell({ children }: PropsWithChildren) {
  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow--one" />
      <div className="auth-glow auth-glow--two" />
      <section className="auth-panel">
        <div className="auth-language"><LanguageSelector/></div>
        <Brand />
        {children}
      </section>
    </main>
  );
}
