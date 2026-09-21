'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Percent, Loader2 } from 'lucide-react';
import { getSettings, updateSettings } from '@/lib/settings-client';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

/**
 * Settings → Payment (Ödəniş)
 *
 * Global EDV (VAT) switch. This replaced the per-order VAT toggle that lived
 * in the POS payment sheet: the decision "does this restaurant apply VAT to
 * new orders" is a restaurant-level setting, so it is configured once here.
 * New orders (POS / QR / takeaway) are created with apply_vat = auto_apply_vat
 * and the total is recomputed server-side (calculate_order_total_v3 SSOT).
 */
const PaymentTab = () => {
  const { t } = useLanguage();
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatPct, setVatPct] = useState<number>(18);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings('payment').then((data) => {
      if (data && Object.keys(data).length) {
        setVatEnabled(!!data.auto_apply_vat);
        if (data.vat_percentage != null && !Number.isNaN(Number(data.vat_percentage))) {
          setVatPct(Number(data.vat_percentage));
        }
      }
      setLoaded(true);
    });
  }, []);

  const toggleVat = async (next: boolean) => {
    if (saving) return;
    const prev = vatEnabled;
    setVatEnabled(next);
    setSaving(true);
    const res = await updateSettings('payment', { auto_apply_vat: next });
    setSaving(false);
    if (!res.ok) {
      setVatEnabled(prev);
      toast.error(res.error || 'Xəta', { id: 'payment-vat-toast' });
    } else {
      toast.success(t('settings_updated'), { id: 'payment-vat-toast', duration: 2500 });
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-9 h-9 rounded-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)] flex items-center justify-center flex-shrink-0">
              <Percent size={16} className="text-[var(--theme-accent)]" strokeWidth={2.4} />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-[var(--theme-text)]">
                {t('pay_vat_title')}
                <span className="ml-2 text-[var(--theme-text-muted)] font-bold">· {Number(vatPct).toFixed(0)}%</span>
              </p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1 leading-relaxed">
                {t('pay_vat_desc')}
              </p>
            </div>
          </div>

          {/* macOS-style switch — saves immediately */}
          <button
            type="button"
            role="switch"
            aria-checked={vatEnabled}
            disabled={saving}
            onClick={() => toggleVat(!vatEnabled)}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent-border)] ${
              vatEnabled ? 'bg-emerald-500' : 'bg-[var(--theme-border-strong)]'
            } ${saving ? 'opacity-60' : ''}`}
          >
            <AnimatePresence initial={false}>
              {saving && (
                <motion.span
                  key="vat-busy"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Loader2 size={13} className="text-white" />
                </motion.span>
              )}
            </AnimatePresence>
            <motion.span
              key="vat-knob"
              className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md"
              animate={{ x: vatEnabled ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentTab;
