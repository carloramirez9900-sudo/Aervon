import type { ReactNode } from 'react';
import { useLanguage } from './i18n';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { TradingPage } from './pages/TradingPage';
import { WalletPage } from './pages/WalletPage';
import { HistoryPage } from './pages/HistoryPage';
import { CompoundPage } from './pages/CompoundPage';
import { ReferralsPage } from './pages/ReferralsPage';
import { HelpCenterPage } from './pages/HelpCenterPage';
import { ProfilePage } from './pages/ProfilePage';
import { loadSession } from './lib/session';
import { AdminGate } from './admin/AdminGate';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { AdminFinancePage } from './admin/AdminFinancePage';
import { AdminOperationsPage } from './admin/AdminOperationsPage';
import { AdminSettingsPage } from './admin/AdminSettingsPage';
import { AdminAuditPage } from './admin/AdminAuditPage';

function PrivateRoute({ children }: { children: ReactNode }) {
  return loadSession()?.accessToken ? children : <Navigate to="/login" replace />;
}

export default function App() {
  useLanguage(); // Re-render every route when language changes.
  return <Routes>
    <Route path="/" element={<Navigate to={loadSession()?.accessToken ? '/dashboard' : '/login'} replace />} />
    <Route path="/login" element={<LoginPage/>} />
    <Route path="/register" element={<RegisterPage/>} />
    <Route path="/dashboard" element={<PrivateRoute><DashboardPage/></PrivateRoute>} />
    <Route path="/trading" element={<PrivateRoute><TradingPage/></PrivateRoute>} />
    <Route path="/wallet" element={<PrivateRoute><WalletPage/></PrivateRoute>} />
    <Route path="/history" element={<PrivateRoute><HistoryPage/></PrivateRoute>} />
    <Route path="/compound" element={<PrivateRoute><CompoundPage/></PrivateRoute>} />
    <Route path="/referrals" element={<PrivateRoute><ReferralsPage/></PrivateRoute>} />
    <Route path="/help" element={<PrivateRoute><HelpCenterPage/></PrivateRoute>} />
    <Route path="/profile" element={<PrivateRoute><ProfilePage/></PrivateRoute>} />
    <Route path="/admin" element={<PrivateRoute><AdminGate><AdminDashboardPage/></AdminGate></PrivateRoute>} />
    <Route path="/admin/users" element={<PrivateRoute><AdminGate><AdminUsersPage/></AdminGate></PrivateRoute>} />
    <Route path="/admin/finance" element={<PrivateRoute><AdminGate><AdminFinancePage/></AdminGate></PrivateRoute>} />
    <Route path="/admin/operations" element={<PrivateRoute><AdminGate><AdminOperationsPage/></AdminGate></PrivateRoute>} />
    <Route path="/admin/settings" element={<PrivateRoute><AdminGate><AdminSettingsPage/></AdminGate></PrivateRoute>} />
    <Route path="/admin/audit" element={<PrivateRoute><AdminGate><AdminAuditPage/></AdminGate></PrivateRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
