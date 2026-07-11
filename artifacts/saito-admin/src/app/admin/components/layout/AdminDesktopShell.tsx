'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const handleToggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sidebarOpen]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (document.fullscreenElement) setSidebarOpen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  return (
    <div className="hidden lg:flex h-screen min-h-0 bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans">
      <SimpleToaster />
      <AnimatePresence>
        {sidebarOpen && !isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Sidebar role={role} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <button
              type="button"
              aria-label="Menyunu bağla"
              className="fixed inset-0 bg-black/55 z-40"
              onClick={() => setSidebarOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.main
        animate={{ marginLeft: isFullscreen ? 0 : 290 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex-1 px-8 min-h-0 relative flex flex-col overflow-x-hidden"
        style={{ maxWidth: isFullscreen ? '100vw' : 'calc(100vw - 290px)' }}
      >
        <LayoutProvider>
          <AdminHeader role={role} onToggleSidebar={handleToggleSidebar} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            {children}
          </div>
        </LayoutProvider>
      </motion.main>
    </div>
  );
}
