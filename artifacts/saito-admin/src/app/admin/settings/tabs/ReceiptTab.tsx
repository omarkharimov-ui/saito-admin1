'use client';

import React, { useState, useEffect } from 'react';
import { useFormDirtyCompare } from '@/hooks/useFormDirty';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Receipt, Percent, DollarSign, AlignLeft, Eye } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { inputCls, labelCls, saveButtonCls } from './_shared';
import ReceiptPreview from '../../shared/ReceiptPreview';
import TactileSwitch from '../../components/ui/TactileSwitch';

interface ReceiptCfg {
  receipt_title: string;
  receipt_currency: string;
  receipt_service_fee_pct: number;
  receipt_show_service_fee: boolean;
  receipt_footer_text: string;
}

const DEFAULTS: ReceiptCfg = {
  receipt_title: 'SİFARİŞ ÇEKİ',
  receipt_currency: '₼',
  receipt_service_fee_pct: 10,
  receipt_show_service_fee: true,
  receipt_footer_text: 'Zəhmət olmasa gözləyin, tezliklə sizinlə olacağıq.',
};

const ReceiptTab = ({ initialData }: { initialData?: Record<string, any> | null }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false); // Instant load
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<ReceiptCfg>(DEFAULTS);

  const { isDirty } = useFormDirtyCompare(cfg, [!loading]);
  const titleEmpty = cfg.receipt_title.trim() === '';
  const currencyEmpty = cfg.receipt_currency.trim() === '';
  const hasError = titleEmpty || currencyEmpty;

  useEffect(() => {
    const merge = (data: Record<string, any>) => {
      setCfg({
        receipt_title: data.receipt_title ?? DEFAULTS.receipt_title,
        receipt_currency: data.receipt_currency ?? DEFAULTS.receipt_currency,
        receipt_service_fee_pct: data.receipt_service_fee_pct ?? DEFAULTS.receipt_service_fee_pct,
        receipt_show_service_fee: data.receipt_show_service_fee ?? DEFAULTS.receipt_show_service_fee,
        receipt_footer_text: data.receipt_footer_text ?? DEFAULTS.receipt_footer_text,
      });
    };

    if (initialData) {
      merge(initialData);
      setLoading(false);
      return;
    }
    supabase.from('settings').select('receipt_title, receipt_currency, receipt_service_fee_pct, receipt_show_service_fee, receipt_footer_text').single().then(({ data }) => {
      if (data) merge(data);
      setLoading(false);
    });
  }, [initialData]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasError) return;
    setSaving(true);
    const { error } = await supabase.from('settings').upsert([{ id: '1', ...cfg }]);
    if (error) {
      toast.error(error.message, { id: 'action-toast' });
    } else {
      toast.success(t('receipt_saved'), { id: 'action-toast', duration: 3000 });
    }
    setSaving(false);
  };

  // Loading spinner removed - instant render

  const previewSubtotal = 12.50;
  const previewServiceFee = cfg.receipt_show_service_fee ? previewSubtotal * (cfg.receipt_service_fee_pct / 100) : 0;
  const previewTotal = previewSubtotal + previewServiceFee;

  return (
    <form noValidate onSubmit={save} className="space-y-8 max-w-2xl">

      {/* ── Görünüş ── */}
      <div className="space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">{t('receipt_section_display')}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Çek başlığı */}
          <div>
            <label className={labelCls}><Receipt size={11} /> {t('receipt_title_label')}</label>
            <input
              className={inputCls + (titleEmpty ? ' !border-red-500/70' : '')}
              value={cfg.receipt_title}
              placeholder={t('receipt_title_placeholder')}
              onChange={e => setCfg({ ...cfg, receipt_title: e.target.value })}
            />
            {titleEmpty && <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1"><span>⚠</span> Bu sahə boş qala bilməz</p>}
            {!titleEmpty && <p className="text-[10px] text-[var(--theme-text-muted)] mt-1.5">{t('receipt_title_hint')}</p>}
          </div>

          {/* Valyuta */}
          <div>
            <label className={labelCls}><DollarSign size={11} /> {t('receipt_currency_label')}</label>
            <input
              className={inputCls + (currencyEmpty ? ' !border-red-500/70' : '')}
              value={cfg.receipt_currency}
              maxLength={5}
              placeholder="₼"
              onChange={e => setCfg({ ...cfg, receipt_currency: e.target.value })}
              style={{ fontFamily: 'inherit' }}
            />
            {currencyEmpty && <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1"><span>⚠</span> Bu sahə boş qala bilməz</p>}
            {!currencyEmpty && <p className="text-[10px] text-[var(--theme-text-muted)] mt-1.5">{t('receipt_currency_hint')}</p>}
          </div>
        </div>

        {/* Servis haqqı */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
          <div className="flex items-center gap-3">
            <Percent size={15} className="text-gold/70" />
            <div>
              <p className="text-sm font-semibold text-[var(--theme-text)]">{t('receipt_show_service_fee')}</p>
              <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">{t('receipt_service_fee_hint')}</p>
            </div>
          </div>
          <TactileSwitch checked={cfg.receipt_show_service_fee} onChange={(next) => setCfg({ ...cfg, receipt_show_service_fee: next })} />
        </div>

        {cfg.receipt_show_service_fee && (
          <div>
            <label className={labelCls}><Percent size={11} /> {t('receipt_service_fee_label')}</label>
            <div className="flex items-center gap-4 max-w-xs">
              <input
                type="range" min={0} max={30} step={0.5}
                value={cfg.receipt_service_fee_pct}
                onChange={e => setCfg({ ...cfg, receipt_service_fee_pct: Number(e.target.value) })}
                className="flex-1 accent-gold h-1.5 rounded-full bg-[var(--theme-border)] cursor-pointer"
              />
              <span className="text-gold font-bold text-sm w-14 text-right">{cfg.receipt_service_fee_pct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Məzmun ── */}
      <div className="space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">{t('receipt_section_content')}</p>

        <div>
          <label className={labelCls}><AlignLeft size={11} /> {t('receipt_footer_label')}</label>
          <textarea
            className={inputCls + ' h-20 resize-none'}
            value={cfg.receipt_footer_text}
            placeholder="Təşəkkür edirik!"
            onChange={e => setCfg({ ...cfg, receipt_footer_text: e.target.value })}
          />
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-1.5">{t('receipt_footer_hint')}</p>
        </div>

      </div>

      {/* ── Önizləmə ── */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)] flex items-center gap-2"><Eye size={11} /> Preview</p>
        <div className="mx-auto">
          <ReceiptPreview
            title={cfg.receipt_title}
            tableNumber={12}
            items={[
              { product_name: 'California Roll', quantity: 2, total_price: 16.00 },
              { product_name: 'Miso Soup', quantity: 1, total_price: 4.50 },
            ]}
            showServiceFee={cfg.receipt_show_service_fee}
            serviceFeePct={cfg.receipt_service_fee_pct}
            currency={cfg.receipt_currency}
            footerText={cfg.receipt_footer_text}
            width={260}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !isDirty || hasError}
          className={`${saveButtonCls} ${!isDirty && !saving ? 'opacity-40 pointer-events-none' : ''}`}
          style={{ background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t('gen_save')}
        </button>
      </div>
    </form>
  );
};

export default ReceiptTab;
