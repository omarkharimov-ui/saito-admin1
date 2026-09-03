'use client';

import React, { useState, useEffect } from 'react';
import { Store, QrCode, Users, BrainCircuit, Timer, Settings2, ShieldCheck, Receipt, MapPin, ChevronLeft, Clock, Printer, Wallet } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AnimatedTabs } from '../components/ui/MotionControls';
import { supabase } from '@/lib/supabase';
import GeneralTab from './tabs/GeneralTab';
import QRTab from './tabs/QRTab';
import HoursTab from './tabs/HoursTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import KitchenTab from './tabs/KitchenTab';
import ReceiptTab from './tabs/ReceiptTab';
import PrinterTab from './tabs/PrinterTab';
import FloorsTab from './tabs/FloorsTab';
import PayrollTab from './tabs/PayrollTab';
import LocationTab from './tabs/LocationTab';


type Tab = 'general' | 'qr' | 'analytics' | 'kitchen' | 'receipt' | 'printer' | 'floors' | 'hours' | 'payroll' | 'location';

type TabDef = { key: Tab; labelKey: string; icon: React.ReactNode; superadminOnly?: boolean; desc?: string };

const TAB_DEFS: TabDef[] = [
  { key: 'general',   labelKey: 'tab_general',   icon: <Store size={20} />,       desc: 'Restoran məlumatları' },
  { key: 'hours',     labelKey: 'tab_hours' as any, icon: <Clock size={20} />,     desc: 'İş saatları' },
  { key: 'qr',        labelKey: 'tab_qr',        icon: <QrCode size={20} />,      desc: 'QR kod və masa linki' },
  { key: 'analytics', labelKey: 'tab_analytics', icon: <BrainCircuit size={20} />,desc: 'Statistika parametrləri' },
  { key: 'kitchen',   labelKey: 'tab_kitchen',   icon: <Timer size={20} />,       desc: 'Mətbəx ayarları' },
  { key: 'receipt',   labelKey: 'tab_receipt',   icon: <Receipt size={20} />,     desc: 'Çek və çıxarış' },
  { key: 'printer',   labelKey: 'tab_printer',   icon: <Printer size={20} />,     desc: 'Printer ayarları' },
  { key: 'floors',    labelKey: 'tab_floors',    icon: <MapPin size={20} />,      desc: 'Zallar, mərtəbələr, masa planı' },
  { key: 'payroll',   labelKey: 'tab_payroll',   icon: <Wallet size={20} />,      desc: 'Payroll və webhook ayarları', superadminOnly: true },
  { key: 'location',  labelKey: 'tab_location',  icon: <MapPin size={20} />,      desc: 'Wi-Fi və GPS geofence' },
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
      {tab === 'hours'     && <HoursTab />}
      {tab === 'qr'        && <QRTab initialData={settingsData} />}
      {tab === 'analytics' && <AnalyticsTab initialData={settingsData} />}
      {tab === 'kitchen'   && <KitchenTab initialData={settingsData} />}
      {tab === 'receipt'   && <ReceiptTab initialData={settingsData} />}
      {tab === 'printer'   && <PrinterTab initialData={settingsData} />}
      {tab === 'floors'    && <FloorsTab />}
      {tab === 'payroll'   && <PayrollTab />}
      {tab === 'location'  && <LocationTab />}
    </>  );
}

const SettingsPage = () => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('general');
  const [mobileTab, setMobileTab] = useState<Tab | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [settingsData, setSettingsData] = useState<Record<string, any> | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setIsSuperadmin(data.role === 'superadmin');
        }
      } catch {
        // fallback to cookie check
        const cookieRole = getCookieRole();
        setIsSuperadmin(cookieRole === 'superadmin');
      } finally {
        setLoadingRole(false);
      }
    };
    fetchRole();
  }, []);

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

  if (loadingRole) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
              className="mobile-tap-lift flex flex-col items-start gap-3 p-4 rounded-2xl bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] active:bg-[var(--theme-surface-hover)] active:border-[var(--theme-border-strong)] text-left"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--theme-surface)] text-[var(--theme-text-secondary)]">
                {tb.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--theme-text)] leading-tight">
                  {t(tb.labelKey as any)}
                </p>
                {tb.desc && <p className="text-[10px] text-[var(--theme-text-secondary)] mt-1 line-clamp-1">{tb.desc}</p>}
              </div>
            </button>
          ))}
        </div>

        {/* Mobile slide-in detail panel */}
        {mobileTab && (
          <div className="fixed inset-0 z-[9999] flex flex-col bg-[var(--theme-surface)]">
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 pt-16 pb-4 border-b border-[var(--theme-border)] bg-[var(--theme-surface)]">
              <button
                onClick={() => setMobileTab(null)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all"
              >
                <ChevronLeft size={22} />
              </button>
              <div className="flex-1 text-center">
                <h2 className="text-[17px] font-serif font-bold text-[var(--theme-text)]">
                  {activeTabDef ? t(activeTabDef.labelKey as any) : ''}
                </h2>
                <p className="text-[9px] uppercase tracking-[0.3em] text-[var(--theme-accent)]/60 mt-0.5">SETTINGS</p>
              </div>
              <div className="w-10" />
            </div>

            <div className="flex-1 px-4 py-6 pb-16 overflow-y-auto">
              <TabContent tab={mobileTab} settingsData={settingsData} isSuperadmin={isSuperadmin} />
            </div>
          </div>
        )}
      </div>

       {/* ── DESKTOP layout ── */}
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

         <div className="flex items-center gap-1 bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] p-1 rounded-2xl w-fit">
           {visibleTabs.map((tb) => (
             <button
               key={tb.key}
               type="button"
               onClick={() => setTab(tb.key)}
               className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${tab === tb.key ? 'bg-[var(--theme-surface)] text-[var(--theme-text)] shadow-sm' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}
             >
               {tb.icon}
               <span className="hidden xl:inline">{t(tb.labelKey as any)}</span>
             </button>
           ))}
         </div>

         <div key={tab} className="animate-in fade-in duration-200">
           <TabContent tab={tab} settingsData={settingsData} isSuperadmin={isSuperadmin} />
         </div>
       </div>
    </div>
  );
};

export default SettingsPage;
