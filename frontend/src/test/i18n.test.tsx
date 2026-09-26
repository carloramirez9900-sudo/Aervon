// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { I18nProvider, getLanguage, setLanguage, tr } from '../i18n';
import { LanguageSelector } from '../components/LanguageSelector';

vi.mock('../lib/session', () => ({ loadSession: vi.fn(() => null) }));
vi.mock('../lib/api', () => ({ authApi: { updateLanguage: vi.fn(async () => ({})) } }));

beforeEach(() => { localStorage.clear(); setLanguage('en'); });
afterEach(() => cleanup());

describe('AERVON bilingual interface', () => {
  it('defaults to English and translates Spanish source labels', () => {
    expect(getLanguage()).toBe('en');
    expect(tr('Inicio')).toBe('Start');
    expect(tr('Contraseña')).toBe('Password');
  });

  it('switches to Spanish, persists the choice and updates HTML lang', async () => {
    render(<I18nProvider><LanguageSelector /></I18nProvider>);
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'ES' }));
    await waitFor(() => expect(getLanguage()).toBe('es'));
    expect(localStorage.getItem('aervon.language')).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(tr('Inicio')).toBe('Inicio');
    expect(tr('Invalid credentials')).toBe('Teléfono o contraseña incorrectos.');
  });

  it('does not store tokens or secrets as language preferences', () => {
    setLanguage('en');
    expect(localStorage.getItem('aervon.language')).toBe('en');
    expect(localStorage.length).toBe(1);
  });
});
