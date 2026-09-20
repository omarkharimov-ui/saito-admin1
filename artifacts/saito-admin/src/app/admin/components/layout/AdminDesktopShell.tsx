'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Sidebar from '../Sidebar';
import { AdminHeader } from '../AdminHeader';
import SimpleToaster from './SimpleToaster';
import { LayoutProvider } from '../../context/LayoutContext';
import { idlePrime } from '@/lib/data-cache';
import type { Role } from '@/lib/permissions';

export default function AdminDesktopShell({
  role,
  children,
}: {
  role: Role | null;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageKey = `${pathname}?${searchParams.toString()}`;
  const handleToggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);

  // v7.3: expose the main-area geometry to pages AS STATE (single source of
  // truth = the shell's own margin). Overlays (e.g. customers inspector)
  // track the sidebar with zero polling/latency and can be toggled live.
  const mainEdge = isFullscreen ? 0 : sidebarOpen ? 290 : 0;
  // NB: measured on the CONTENT container's top (not the header's bottom —
  // header mb-3 margin-collapse would make rect.bottom underreport).
  const contentRef = useRef<HTMLDivElement>(null);
  const [mainBottom, setMainBottom] = useState(0);
  useEffect(() => {
    const measure = () => {
      const el = contentRef.current;
      if (!el) return;
      setMainBottom(Math.round(el.getBoundingClientRect().top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

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

  // v7 "native feel": pre-warm hot data endpoints in idle windows on every
  // page switch, so the next page's list paints from cache — not a spinner.
  useEffect(() => {
    idlePrime(['/api/customers?q=&limit=50', '/api/orders']);
  }, [pageKey]);

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
        <LayoutProvider mainEdge={mainEdge} mainBottom={mainBottom}>
          <div className="relative z-50">
            <AdminHeader role={role} onToggleSidebar={handleToggleSidebar} collapsed={!sidebarOpen} />
          </div>
          <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto">
            <div key={pageKey} className="w-full h-full">
              {children}
            </div>
          </div>
        </LayoutProvider>
      </main>
    </div>
  );
}
