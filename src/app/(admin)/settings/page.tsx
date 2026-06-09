'use client';

import React, { useState, useEffect } from 'react';
import { Store, QrCode, Users, BrainCircuit, Timer, Settings2, ShieldCheck, Receipt, MapPin, ChevronLeft } from 'lucide-react';
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
import FloorsTab from './tabs/FloorsTab';

type Tab = 'general' | 'staff' | 'qr' | 'analytics' | 'kitchen' | 'receipt' | 'users' | 'floors';

type TabDef = { key: Tab; labelKey: string; icon: React.ReactNode; superadminOnly?: boolean; desc?: string };

const TAB_DEFS: TabDef[] = [
  { key: 'general',   labelKey: 'tab_general',   icon: <Store size={20} />,       desc: 'Restoran məlumatları' },
  { key: 'staff',     labelKey: 'tab_staff',     icon: <Users size={20} />,       desc: 'İşçilər və icazələr' },
  { key: 'qr',        labelKey: 'tab_qr',        icon: <QrCode size={20} />,      desc: 'QR kod və masa linki' },
  { key: 'analytics', labelKey: 'tab_analytics', icon: <BrainCircuit size={20} />,desc: 'Statistika parametrləri' },
  { key: 'kitchen',   labelKey: 'tab_kitchen',   icon: <Timer size={20} />,       desc: 'Mətbəx ayarları' },
  { key: 'receipt',   labelKey: 'tab_receipt',   icon: <Receipt size={20} />,     desc: 'Çek və çıxarış' },
  { key: 'users',     labelKey: 'tab_users',     icon: <ShieldCheck size={20} />, desc: 'Admin hesabları', superadminOnly: true },
  { key: 'floors',    labelKey: 'tab_floors',    icon: <MapPin size={20} />,      desc: 'Zallar, mərtəbələr, masa planı' },
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
      {tab === 'floors'    && <FloorsTab />}
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
    <div className="pb-4 lg:pb-20">

      {/* ── MOBILE layout ── */}
      <div className="lg:hidden px-4">
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
                  {t(tb.labelKey as any)}
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
                  {activeTabDef ? t(activeTabDef.labelKey as any) : ''}
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
      <div className="hidden lg:block space-y-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gold/10 text-gold rounded-2xl">
            <Settings2 size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-white">{t('settings')}</h1>
            <p className="text-sm text-white/35 uppercase tracking-[0.2em] mt-0.5">{t('settings_subtitle')}</p>
          </div>
        </div>

<div className="flex items-center gap-1 p-1 border border-white/[0.08] bg-white/[0.03] rounded-xl overflow-x-auto scrollbar-none">
          {visibleTabs.map(tb => {
            const isActive = tab === tb.key;
            return (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors whitespace-nowrap ${
                  isActive ? 'text-white' : 'text-white/35 hover:text-white/70'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="settings-active-tab-indicator"
                    className="absolute inset-0 rounded-lg bg-white/[0.12] border border-white/[0.16]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className={`relative z-10 ${isActive ? 'text-gold' : 'text-white/35'}`}>{tb.icon}</span>
                <span className="relative z-10">{t(tb.labelKey as any)}</span>
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
