'use client';

import React, { useState, useEffect } from 'react';
import { Store, QrCode, Users, BrainCircuit, Timer, Settings2, ShieldCheck, Receipt, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { supabase } from '@/lib/supabase';
import GeneralTab from './tabs/GeneralTab';
import QRTab from './tabs/QRTab';
import StaffTab from './tabs/StaffTab';
import HoursTab from './tabs/HoursTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import KitchenTab from './tabs/KitchenTab';
import UsersTab from './tabs/UsersTab';
import ReceiptTab from './tabs/ReceiptTab';

type Tab = 'general' | 'staff' | 'qr' | 'analytics' | 'kitchen' | 'receipt' | 'users';

type TabDef = { key: Tab; labelKey: string; icon: React.ReactNode; superadminOnly?: boolean; desc?: string };

const TAB_DEFS: TabDef[] = [
  { key: 'general',   labelKey: 'tab_general',   icon: <Store size={20} />,       desc: 'Restoran məlumatları' },
  { key: 'staff',     labelKey: 'tab_staff',     icon: <Users size={20} />,       desc: 'İşçilər və icazələr' },
  { key: 'qr',        labelKey: 'tab_qr',        icon: <QrCode size={20} />,      desc: 'QR kod və masa linki' },
  { key: 'analytics', labelKey: 'tab_analytics', icon: <BrainCircuit size={20} />,desc: 'Statistika parametrləri' },
  { key: 'kitchen',   labelKey: 'tab_kitchen',   icon: <Timer size={20} />,       desc: 'Mətbəx ayarları' },
  { key: 'receipt',   labelKey: 'tab_receipt',   icon: <Receipt size={20} />,     desc: 'Çek və çıxarış' },
  { key: 'users',     labelKey: 'tab_users',     icon: <ShieldCheck size={20} />, desc: 'Admin hesabları', superadminOnly: true },
];

function getCookieRole(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').find(c => c.trim().startsWith('saito_role='));
  return match ? match.trim().split('=')[1] : null;
}

function TabContent({ tab, settingsData, isSuperadmin }: { tab: Tab; settingsData: Record<string, any> | null; isSuperadmin: boolean }) {
  return (
    <>
      {tab === 'general'   && <GeneralTab initialData={settingsData} />}
      {tab === 'staff'     && <StaffTab />}
      {tab === 'qr'        && <QRTab initialData={settingsData} />}
      {tab === 'analytics' && <AnalyticsTab initialData={settingsData} />}
      {tab === 'kitchen'   && <KitchenTab initialData={settingsData} />}
      {tab === 'receipt'   && <ReceiptTab initialData={settingsData} />}
      {tab === 'users'     && isSuperadmin && <UsersTab role={getCookieRole()} />}
    </>
  );
}

const SettingsPage = () => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('general');
  const [mobileTab, setMobileTab] = useState<Tab | null>(null);
  const isSuperadmin = typeof window !== 'undefined' && getCookieRole() === 'superadmin';
  const [settingsData, setSettingsData] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    supabase.from('settings').select('*').single().then(({ data }) => {
      if (data) setSettingsData(data);
    });
  }, []);

  const visibleTabs = TAB_DEFS.filter(tb => !tb.superadminOnly || isSuperadmin);
  const activeTabDef = visibleTabs.find(tb => tb.key === mobileTab);

  useEffect(() => {
    if (mobileTab) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileTab]);

  return (
    <div className="pb-20">

      {/* ── MOBILE layout ── */}
      <div className="md:hidden px-4">
        {/* Mobile header - minimal */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-gold/10 text-gold rounded-xl flex items-center justify-center">
            <Settings2 size={18} />
          </div>
          <div>
            <h1 className="text-xl font-serif font-bold text-white">{t('settings')}</h1>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">{t('settings_subtitle')}</p>
          </div>
        </div>

        {/* Mobile nav - 2 column grid dizayn */}
        <div className="grid grid-cols-2 gap-3 mobile-stagger">
          {visibleTabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setMobileTab(tb.key)}
              className="mobile-tap-lift flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] active:bg-white/[0.06] active:border-white/[0.10] text-left"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.05] text-white/50">
                {tb.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-white/90 leading-tight">
                  {t(tb.labelKey as Parameters<typeof t>[0])}
                </p>
                {tb.desc && <p className="text-[10px] text-white/30 mt-1 line-clamp-1">{tb.desc}</p>}
              </div>
            </button>
          ))}
        </div>

        {/* Mobile slide-in detail panel - ani açılma, hamburgerden yuksek z-index */}
        {mobileTab && (
          <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0a0a0a]">
            {/* Panel header - hamburgeri örtmək üçün extra top padding */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 pt-16 pb-4 border-b border-white/[0.06] bg-[#0a0a0a]">
              <button
                onClick={() => setMobileTab(null)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.05] text-white/50 hover:text-white transition-all"
              >
                <ChevronLeft size={22} />
              </button>
              <div className="flex-1 text-center">
                <h2 className="text-[17px] font-serif font-bold text-white">
                  {activeTabDef ? t(activeTabDef.labelKey as Parameters<typeof t>[0]) : ''}
                </h2>
                <p className="text-[9px] uppercase tracking-[0.3em] text-gold/60 mt-0.5">SETTINGS</p>
              </div>
              <div className="w-10" />
            </div>

            {/* Panel content */}
            <div className="flex-1 px-4 py-6 pb-16 overflow-y-auto">
              <TabContent tab={mobileTab} settingsData={settingsData} isSuperadmin={isSuperadmin} />
            </div>
          </div>
        )}
      </div>

      {/* ── DESKTOP layout — unchanged ── */}
      <div className="hidden md:block space-y-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gold/10 text-gold rounded-2xl">
            <Settings2 size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-white">{t('settings')}</h1>
            <p className="text-sm text-white/35 uppercase tracking-[0.2em] mt-0.5">{t('settings_subtitle')}</p>
          </div>
        </div>

        <div className="flex items-end gap-0 border-b border-white/[0.07] overflow-x-auto scrollbar-none">
          {visibleTabs.map(tb => {
            const isActive = tab === tb.key;
            return (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`relative flex items-center gap-2 px-5 py-3 text-[11px] font-bold uppercase tracking-widest transition-all ${
                  isActive ? 'text-gold' : 'text-white/30 hover:text-white/60'
                }`}
              >
                <span className={isActive ? 'text-gold' : 'text-white/25'}>{tb.icon}</span>
                {t(tb.labelKey as Parameters<typeof t>[0])}
                {isActive && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-gold/60 via-gold to-gold/60 rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div key={tab}>
          <TabContent tab={tab} settingsData={settingsData} isSuperadmin={isSuperadmin} />
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
