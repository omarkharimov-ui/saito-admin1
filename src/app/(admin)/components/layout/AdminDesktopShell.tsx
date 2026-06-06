'use client';

import { useCallback, useEffect, useState } from 'react';
import Sidebar from '../Sidebar';
import { AdminHeader } from '../AdminHeader';
import SimpleToaster from './SimpleToaster';
import { LayoutProvider } from '../../context/LayoutContext';
import { useTheme } from '@/lib/theme/ThemeContext';

export default function AdminDesktopShell({
  role,
  children,
}: {
  role: 'admin' | 'superadmin' | null;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { lightMode } = useTheme();
  const handleToggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sidebarOpen]);

  return (
    <div className="hidden lg:flex h-screen min-h-0 bg-background text-foreground font-sans selection:bg-gold selection:text-black">
      <SimpleToaster />
      <Sidebar role={role} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Menyunu bağla"
          className={`fixed inset-0 z-40 ${lightMode ? 'bg-black/10' : 'bg-black/55'}`}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 ml-[272px] px-8 min-h-0 relative bg-background flex flex-col">
        <LayoutProvider>
          <AdminHeader role={role} onToggleSidebar={handleToggleSidebar} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            {children}
          </div>
        </LayoutProvider>
      </main>
    </div>
  );
}
