'use client';

/**
 * /owner — owner mobile dashboard route shell.
 *
 * 2026-09-26 (Task 53 P1-3): Toast-Now style phone dashboard for the owner
 * ("Sahib paneli"). Lives OUTSIDE /admin so it can be opened full-screen from
 * the phone home screen; it therefore re-creates the /admin provider stack
 * (ThemeProvider + LanguageProvider) and re-uses the EXACT same auth guard
 * (useAdminAuth + AdminLoadingScreen + AdminAuthScreen → router.replace('/login')),
 * so an unauthenticated visit behaves identically to /admin.
 */

import { ThemeProvider } from '@/lib/theme/ThemeContext';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { useAdminAuth } from '@/app/admin/hooks/useAdminAuth';
import AdminLoadingScreen from '@/app/admin/components/layout/AdminLoadingScreen';
import AdminAuthScreen from '@/app/admin/components/layout/AdminAuthScreen';
import SimpleToaster from '@/app/admin/components/layout/SimpleToaster';
import OwnerDashboard from './OwnerDashboard';

function OwnerAuthGate() {
  const auth = useAdminAuth();

  if (!auth.authChecked) {
    return <AdminLoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    return <AdminAuthScreen />;
  }

  return (
    <>
      <SimpleToaster />
      <OwnerDashboard />
    </>
  );
}

export default function OwnerPage() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <OwnerAuthGate />
      </LanguageProvider>
    </ThemeProvider>
  );
}
