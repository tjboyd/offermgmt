import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { BrandingProvider } from '@/context/BrandingContext';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage }    from '@/pages/LoginPage';
import { ActivatePage } from '@/pages/ActivatePage';
import {
  SettingsPage, OrganizationTab, SeasonsTab, DivisionsTab, TeamsTab, TemplatesTab,
  SecurityTab, UsersTab, ResetDataTab, PlayersTab,
} from '@/pages/Settings/SettingsPage';
import { IntegrationsTab } from '@/pages/Settings/IntegrationsTab';
import { DashboardPage }   from '@/pages/DashboardPage';
import { RosterPage }      from '@/pages/RosterPage';
import { AccountPage }     from '@/pages/AccountPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-bg-primary flex items-center justify-center text-[#888]">Loading…</div>;
  if (!user)   return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { restore } = useAuth();

  useEffect(() => { restore(); }, [restore]);

  return (
    <BrandingProvider>
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/activate" element={<ActivatePage />} />

        {/* Protected app shell */}
        <Route path="/" element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="players"   element={<RosterPage />} />
          <Route path="roster"    element={<Navigate to="/players" replace />} />
          <Route path="account"   element={<AccountPage />} />

          {/* Settings with nested tab routes */}
          <Route path="settings" element={<SettingsPage />}>
            <Route path="organization" element={<OrganizationTab />} />
            <Route path="seasons"      element={<SeasonsTab />} />
            <Route path="divisions"    element={<DivisionsTab />} />
            <Route path="teams"        element={<TeamsTab />} />
            <Route path="templates"    element={<TemplatesTab />} />
            <Route path="integrations" element={<IntegrationsTab />} />
            <Route path="security"     element={<SecurityTab />} />
            <Route path="users"        element={<UsersTab />} />
            <Route path="players"      element={<PlayersTab />} />
            <Route path="reset"        element={<ResetDataTab />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
    </BrandingProvider>
  );
}
