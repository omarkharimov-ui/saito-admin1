'use client';

import MobileTopBar from './MobileTopBar';
import ImmersiveNavigationDock from './ImmersiveNavigationDock';
import MobilePageContent from './MobilePageContent';
import SimpleToaster from './SimpleToaster';

export default function AdminMobileShell({
  role,
  onLogout,
  children,
}: {
  role: 'admin' | 'superadmin' | null;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-[100dvh] min-h-0 bg-background text-foreground font-sans">
      <SimpleToaster />
      <MobileTopBar role={role} />
      <main
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] bg-background"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <MobilePageContent>{children}</MobilePageContent>
      </main>
      <ImmersiveNavigationDock role={role} onLogout={onLogout} />
    </div>
  );
}
