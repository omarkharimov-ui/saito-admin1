'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
      <Sidebar role={role} isOpen={sidebarOpen && !isFullscreen} onClose={() => setSidebarOpen(false)} />

      <motion.main
        animate={{ marginLeft: isFullscreen ? 0 : 290 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex-1 px-8 min-h-0 relative flex flex-col overflow-x-hidden"
        style={{ maxWidth: isFullscreen ? '100vw' : 'calc(100vw - 290px)' }}
      >
        <LayoutProvider>
          <AdminHeader role={role} onToggleSidebar={handleToggleSidebar} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={pageKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="w-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </LayoutProvider>
      </motion.main>
    </div>
  );
}
