'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, CalendarDays, Wallet, ArrowLeftRight, LogOut } from 'lucide-react';

const TABS = [
  { id: 'home', name: 'Ana', href: '/staff', icon: Home },
  { id: 'schedule', name: 'Cədvəl', href: '/staff/schedule', icon: CalendarDays },
  { id: 'payroll', name: 'Maaş', href: '/staff/payroll', icon: Wallet },
  { id: 'swap', name: 'Mübadilə', href: '/staff/swap', icon: ArrowLeftRight },
];

export function StaffBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    window.location.replace('/staff/login');
  };

  const isActive = (href: string) =>
    href === '/staff' ? pathname === '/staff' : pathname.startsWith(href);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-neutral-950/95 backdrop-blur-xl pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
      <div className="flex items-stretch justify-around max-w-md mx-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 rounded-2xl transition-colors ${
                active ? 'text-emerald-400' : 'text-white/40'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] font-semibold ${active ? 'text-emerald-400' : 'text-white/40'}`}>
                {tab.name}
              </span>
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex flex-1 flex-col items-center gap-0.5 py-1.5 rounded-2xl text-white/40"
        >
          <LogOut size={22} />
          <span className="text-[10px] font-semibold text-white/40">Çıxış</span>
        </button>
      </div>
    </nav>
  );
}
