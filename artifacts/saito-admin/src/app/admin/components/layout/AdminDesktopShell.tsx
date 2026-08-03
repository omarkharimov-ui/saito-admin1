'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Sidebar from '../Sidebar';
import { AdminHeader } from '../AdminHeader';
import SimpleToaster from './SimpleToaster';
import { LayoutProvider } from '../../context/LayoutContext';

export default function AdminDesktopShell({
  role,
  children,
}: {
  role: 'admin' | 'superadmin' | null;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageKey = `${pathname}?${searchParams.toString()}`;
  const handleToggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);

  const isPosPage = pathname === '/admin/pos' || pathname.startsWith('/admin/pos?');

  useEffect(() => {
    if (isPosPage) setSidebarOpen(false);
  }, [isPosPage]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024 && !isPosPage) setSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isPosPage]);

  useEffect(() => {
    const handler = () => setSidebarOpen(prev => !prev);
    window.addEventListener('pos-toggle-sidebar', handler);
    return () => window.removeEventListener('pos-toggle-sidebar', handler);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) {
        setSidebarOpen(true);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  return (
    <div className="hidden lg:flex h-screen min-h-0 bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans">
      <SimpleToaster />
      <Sidebar role={role} isOpen={sidebarOpen && !isFullscreen} />

      <main
        className="flex-1 px-8 min-h-0 relative flex flex-col overflow-x-hidden"
        style={{
          marginLeft: isFullscreen ? 0 : sidebarOpen ? 290 : 0,
          maxWidth: isFullscreen ? '100vw' : sidebarOpen ? 'calc(100vw - 290px)' : '100vw',
          transition: 'margin-left 0.25s ease, max-width 0.25s ease',
        }}
      >
        <LayoutProvider>
          <AdminHeader role={role} onToggleSidebar={handleToggleSidebar} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div key={pageKey} className="w-full">
              {children}
            </div>
          </div>
        </LayoutProvider>
      </main>
    </div>
  );
}
