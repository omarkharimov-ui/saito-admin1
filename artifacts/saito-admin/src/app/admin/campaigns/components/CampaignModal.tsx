'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Zap, Loader2, Search, CheckCircle2, CalendarOff, Percent, Gift, Sparkles, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Campaign, Product, Category } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import GoldSelect from '@/components/GoldSelect';
import GoldCalendar from '@/components/GoldCalendar';

export interface RuleForm {
  rule_type: 'percentage' | 'fixed_amount' | 'buy_x_pay_y' | 'buy_x_get_y' | 'happy_hour' | 'free_delivery' | 'combo';
  percentage?: number;
  fixed_amount?: number;
  buy_quantity?: number;
  pay_quantity?: number;
  free_quantity?: number;
  start_time?: string;
  end_time?: string;
  weekdays?: number[];
  is_recurring?: boolean;
  delivery_min_order?: number;
  delivery_zones?: string[];
  combo_discount_type?: string;
  combo_discount_value?: number;
}

export interface TargetForm {
  target_type: 'product' | 'category' | 'whole_order' | 'combo';
  target_id?: string;
}

export interface ScheduleForm {
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  weekdays?: number[];
  is_recurring?: boolean;
}

export interface FormState {
  name: string;
  title: string;
  description: string;
  type: Campaign['type'];
  status: 'active' | 'inactive' | 'draft';
  priority: number;
  stackable: boolean;
  exclusive: boolean;
  max_uses: number | null;
  max_uses_per_customer: number | null;
  max_uses_per_day: number | null;
  max_uses_per_order: number | null;
  min_order_amount: number | null;
  max_order_amount: number | null;
  dining_type: string[];
  table_numbers: number[];
  auto_apply: boolean;
  requires_coupon: boolean;
  coupon_code: string;
  start_date: string;
  end_date: string;
  rules: RuleForm[];
  targets: TargetForm[];
  schedules: ScheduleForm[];
}

interface Props {
  open: boolean;
  campaign: (Campaign & { rules?: any[]; targets?: any[]; schedules?: any[] }) | null;
  form: FormState;
  isSubmitting: boolean;
  productSearch: string;
  filteredProducts: Product[];
  products: Product[];
  categories: Category[];
  onClose: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<any>>;
  onProductSearch: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const CAMPAIGN_TYPES = (t: Function) => [
  { id: 'PERCENTAGE' as const, label: t('percentage_discount') || 'Faiz Endirimi', icon: Percent },
  { id: 'FIXED_AMOUNT' as const, label: 'Sabit Məbləğ', icon: Percent },
  { id: 'BUY_X_PAY_Y' as const, label: 'Al Ödə', icon: Gift },
  { id: 'BUY_X_GET_Y' as const, label: 'Al Pulsuz', icon: Gift },
  { id: 'HAPPY_HOUR' as const, label: t('campaign_type_happy_hour') || 'Happy Hour', icon: Zap },
  { id: 'FREE_DELIVERY' as const, label: t('campaign_type_free_delivery') || 'Pulsuz Çatdırılma', icon: Sparkles },
  { id: 'COMBO' as const, label: 'Kombo', icon: Gift },
];

const WEEKDAYS = [
  { id: 1, label: 'Baz' },
  { id: 2, label: 'Çax' },
  { id: 3, label: 'Çər' },
  { id: 4, label: 'Cax' },
  { id: 5, label: 'Cüm' },
  { id: 6, label: 'Şən' },
  { id: 0, label: 'Bə' },
];

const CampaignModal = ({
  open, campaign, form, isSubmitting, productSearch,
  filteredProducts, products, categories, onClose, onFormChange, onProductSearch, onSubmit,
}: Props) => {
  const { t, language } = useLanguage();
  const campaignTypes = CAMPAIGN_TYPES(t);
  const [translating, setTranslating] = useState(false);

  const rule = form.rules[0] || { rule_type: form.type.toLowerCase().replace('buy_x_get_y', 'buy_x_get_y').replace('buy_x_pay_y', 'buy_x_pay_y') };

  const updateRule = (patch: Partial<RuleForm>) => {
    const newRules = [...form.rules];
    if (newRules.length === 0) {
      newRules.push({ rule_type: 'percentage', ...patch });
    } else {
      newRules[0] = { ...newRules[0], ...patch };
    }
    onFormChange({ ...form, rules: newRules });
  };

  const updateTargets = (targets: TargetForm[]) => {
    onFormChange({ ...form, targets });
  };

  const updateSchedules = (schedules: ScheduleForm[]) => {
    onFormChange({ ...form, schedules });
  };

  const toggleWeekday = (day: number) => {
    const current = rule.weekdays || [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    updateRule({ weekdays: next });
  };

  const toggleDiningType = (type: string) => {
    const current = form.dining_type || [];
    const next = current.includes(type) ? current.filter(t => t !== type) : [...current, type];
    onFormChange({ ...form, dining_type: next });
  };

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!form.name.trim() && !form.title.trim()) {
      newErrors.name = 'Kampaniya adı tələb olunur';
    }
    
    const rule = form.rules[0];
    if (!rule) {
      newErrors.rule = 'Qaydalar tələb olunur';
    } else {
      if (rule.rule_type === 'percentage' || rule.rule_type === 'happy_hour') {
        const pct = rule.percentage || 0;
        if (pct <= 0 || pct > 100) {
          newErrors.percentage = 'Faiz 1 ilə 100 arasında olmalıdır';
        }
      }
      if (rule.rule_type === 'fixed_amount') {
        const amount = rule.fixed_amount || 0;
        if (amount < 0) {
          newErrors.fixed_amount = 'Məbləğ mənfi ola bilməz';
        }
      }
      if (rule.rule_type === 'buy_x_pay_y') {
        const buy = rule.buy_quantity || 0;
        const pay = rule.pay_quantity || 0;
        if (buy <= 0 || pay <= 0) {
          newErrors.buy_pay = 'Al və Ödə mütləqdir';
        } else if (pay >= buy) {
          newErrors.buy_pay = 'Ödə məbləği Al məbləğindən kiçik olmalıdır';
        }
      }
      if (rule.rule_type === 'buy_x_get_y') {
        const buy = rule.buy_quantity || 0;
        const free = rule.free_quantity || 0;
        if (buy <= 0 || free < 0) {
          newErrors.buy_get = 'Al məbləği mütləqdir';
        }
      }
    }
    
    if (!form.targets[0]?.target_id && form.targets[0]?.target_type !== 'whole_order') {
      newErrors.target = 'Hədəf seçilməlidir';
    }
    
    if (form.requires_coupon && !form.coupon_code.trim()) {
      newErrors.coupon = 'Kupon kodu tələb olunur';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (!validate()) {
      toast.error('Zəhmət olmasa xətaları düzəldin');
      return;
    }
    onSubmit(e);
  };

  const formBody = (
    <form noValidate onSubmit={handleSubmit} className="space-y-6 px-4 md:px-6 py-6 w-full overflow-hidden">
      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('campaign_name')}</label>
          <input type="text" value={form.name || form.title} onChange={(e) => onFormChange({ ...form, name: e.target.value, title: e.target.value })}
            className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
            placeholder={language === 'en' ? 'e.g: Roll Week Discount' : language === 'ru' ? 'напр: Скидка Недели Роллов' : 'Məs: Roll Həftəsi Endirimi'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('campaign_type')}</label>
            <GoldSelect
              value={form.type}
              options={campaignTypes.map((ct: {id: string, label: string, icon: React.ComponentType<{size: number, strokeWidth: number}>}) => ({ value: ct.id, label: ct.label, icon: <ct.icon size={13} strokeWidth={1.5} /> }))}
              onChange={(val) => {
                const newType = val as Campaign['type'];
                let defaultRule: RuleForm = { rule_type: 'percentage' };
                if (newType === 'FIXED_AMOUNT') defaultRule = { rule_type: 'fixed_amount', fixed_amount: 0 };
                else if (newType === 'BUY_X_PAY_Y') defaultRule = { rule_type: 'buy_x_pay_y', buy_quantity: 2, pay_quantity: 1 };
                else if (newType === 'BUY_X_GET_Y') defaultRule = { rule_type: 'buy_x_get_y', buy_quantity: 2, free_quantity: 1 };
                else if (newType === 'HAPPY_HOUR') defaultRule = { rule_type: 'happy_hour', percentage: 20, start_time: '14:00', end_time: '17:00', weekdays: [1,2,3,4,5] };
                else if (newType === 'FREE_DELIVERY') defaultRule = { rule_type: 'free_delivery', delivery_min_order: 30 };
                else if (newType === 'COMBO') defaultRule = { rule_type: 'combo', combo_discount_type: 'fixed', combo_discount_value: 0 };

                onFormChange({
                  ...form,
                  type: newType,
                  rules: [defaultRule],
                  targets: [{ target_type: 'whole_order' }],
                });
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Status</label>
            <GoldSelect
              value={form.status}
              options={[
                { value: 'active', label: 'Aktiv' },
                { value: 'inactive', label: 'Deaktiv' },
                { value: 'draft', label: 'Qaralama' },
              ]}
              onChange={(val) => onFormChange({ ...form, status: val as any })}
            />
          </div>
        </div>

        {rule.rule_type === 'percentage' && (
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('discount_percent_label') || 'Endirim Faizi (%)'}</label>
            <input type="number" min="1" max="100" value={rule.percentage || ''} onChange={(e) => updateRule({ percentage: parseFloat(e.target.value) || 0 })}
              className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
              placeholder={language === 'en' ? 'e.g: 20' : language === 'ru' ? 'напр: 20' : 'Məs: 20'} />
          </div>
        )}

        {rule.rule_type === 'fixed_amount' && (
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('discount_amount_label') || 'Endirim Məbləği (₼)'}</label>
            <input type="number" min="0" step="0.01" value={rule.fixed_amount || ''} onChange={(e) => updateRule({ fixed_amount: parseFloat(e.target.value) || 0 })}
              className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
              placeholder="Məs: 5.00" />
          </div>
        )}

        {(rule.rule_type === 'buy_x_pay_y' || rule.rule_type === 'buy_x_get_y') && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Al</label>
              <input type="number" min="1" value={rule.buy_quantity || 1} onChange={(e) => updateRule({ buy_quantity: parseInt(e.target.value) || 1 })}
                className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">
                {rule.rule_type === 'buy_x_pay_y' ? 'Ödə' : 'Pulsuz'}
              </label>
              <input type="number" min="0" value={rule.rule_type === 'buy_x_pay_y' ? (rule.pay_quantity || 1) : (rule.free_quantity || 1)} onChange={(e) => updateRule(rule.rule_type === 'buy_x_pay_y' ? { pay_quantity: parseInt(e.target.value) || 1 } : { free_quantity: parseInt(e.target.value) || 0 })}
                className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all" />
            </div>
          </div>
        )}

        {(rule.rule_type === 'percentage' || rule.rule_type === 'happy_hour') && (
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('discount_percent_label') || 'Endirim Faizi (%)'}</label>
            <input type="number" min="1" max="100" value={rule.percentage || ''} onChange={(e) => updateRule({ percentage: parseFloat(e.target.value) || 0 })}
              className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
              placeholder="Məs: 20" />
          </div>
        )}

        {rule.rule_type === 'happy_hour' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Başlanğıc</label>
              <input type="time" value={rule.start_time || '14:00'} onChange={(e) => updateRule({ start_time: e.target.value })}
                className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Bitiş</label>
              <input type="time" value={rule.end_time || '17:00'} onChange={(e) => updateRule({ end_time: e.target.value })}
                className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] outline-none transition-all" />
            </div>
          </div>
        )}

        {rule.rule_type === 'happy_hour' && (
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Günlər</label>
            <div className="flex gap-2">
              {WEEKDAYS.map(day => (
                <button key={day.id} type="button" onClick={() => toggleWeekday(day.id)}
                  className={`w-10 h-10 rounded-xl text-[11px] font-bold transition-all ${(rule.weekdays || []).includes(day.id) ? 'bg-[var(--theme-accent)] text-black' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {rule.rule_type === 'free_delivery' && (
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Minimum sifariş (₼)</label>
            <input type="number" min="0" step="0.01" value={rule.delivery_min_order || ''} onChange={(e) => updateRule({ delivery_min_order: parseFloat(e.target.value) || 0 })}
              className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
              placeholder="Məs: 30" />
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Hədəf</label>
          <div className="flex gap-2">
            {['whole_order', 'product', 'category', 'combo'].map(targetType => (
              <button key={targetType} type="button" onClick={() => updateTargets([{ target_type: targetType as any, target_id: form.targets[0]?.target_id }])}
                className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${form.targets[0]?.target_type === targetType ? 'bg-[var(--theme-accent)] text-black' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                {targetType === 'whole_order' ? 'Sifariş' : targetType === 'product' ? 'Məhsul' : targetType === 'category' ? 'Kateqoriya' : 'Kombo'}
              </button>
            ))}
          </div>
        </div>

        {(form.targets[0]?.target_type === 'product' || form.targets[0]?.target_type === 'category') && (
          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">
              {form.targets[0]?.target_type === 'product' ? 'Məhsullar' : 'Kateqoriyalar'}
            </label>
            
            {/* Category tabs - only for products */}
            {form.targets[0]?.target_type === 'product' && categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <button type="button" onClick={() => onProductSearch('')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${!productSearch ? 'bg-[var(--theme-accent)] text-black' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                  Hamısı
                </button>
                {categories.map(cat => (
                  <button key={cat.id} type="button" onClick={() => onProductSearch(cat.name)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${productSearch === cat.name ? 'bg-[var(--theme-accent)] text-black' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
              <input type="text" placeholder={form.targets[0]?.target_type === 'product' ? 'Məhsul axtar...' : 'Kateqoriya axtar...'} value={productSearch} onChange={(e) => onProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-3 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all" />
            </div>

            {/* Selected items chips */}
            {form.targets[0]?.target_id && (
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const selected = form.targets[0]?.target_type === 'product' 
                    ? products.find(p => p.id === form.targets[0]?.target_id)
                    : categories.find(c => c.id === form.targets[0]?.target_id);
                  if (!selected) return null;
                  return (
                    <span key={selected.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)] text-[11px] font-semibold text-[var(--theme-text)]">
                      {'image_url' in selected && selected.image_url && (
                        <img src={selected.image_url as string} alt="" className="w-4 h-4 rounded object-cover" />
                      )}
                      {selected.name}
                      <button type="button" onClick={() => updateTargets([{ ...form.targets[0], target_id: '' }])}
                        className="ml-1 text-[var(--theme-text-muted)] hover:text-red-400 transition-colors">
                        <X size={12} />
                      </button>
                    </span>
                  );
                })()}
              </div>
            )}

            {/* Items grid */}
            <div className="max-h-[200px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
              <div className="grid grid-cols-2 gap-2">
                {(form.targets[0]?.target_type === 'product' ? filteredProducts : categories).map(item => (
                  <button key={item.id} type="button" onClick={() => {
                    const newTargets = [...form.targets];
                    newTargets[0] = { ...newTargets[0], target_id: item.id };
                    updateTargets(newTargets);
                  }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${form.targets[0]?.target_id === item.id ? 'bg-[var(--theme-accent-soft)] border-[var(--theme-accent-border)]' : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] hover:bg-[var(--theme-panel)]'}`}>
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                      {'image_url' in item && item.image_url ? (
                        <img src={item.image_url as string} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--theme-text-muted)] text-[9px] font-black">{item.name.slice(0,2).toUpperCase()}</div>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className={`text-[11px] font-semibold truncate ${form.targets[0]?.target_id === item.id ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{item.name}</p>
                      {'price' in item && <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">₼{(item as any).price}</p>}
                    </div>
                    {form.targets[0]?.target_id === item.id && <CheckCircle2 size={14} className="text-white flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Zaman</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-[var(--theme-text-muted)]">Başlanğıc tarix</label>
              <GoldCalendar value={form.schedules[0]?.start_date || ''} min={new Date().toISOString().split('T')[0]} onChange={(val) => updateSchedules([{ ...form.schedules[0], start_date: val }])} />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-[var(--theme-text-muted)]">Bitiş tarix</label>
              <GoldCalendar value={form.schedules[0]?.end_date || ''} min={new Date().toISOString().split('T')[0]} onChange={(val) => updateSchedules([{ ...form.schedules[0], end_date: val }])} />
            </div>
          </div>
          <label className="flex items-center gap-2 mt-2">
            <input type="checkbox" checked={form.schedules[0]?.is_recurring || false} onChange={(e) => updateSchedules([{ ...form.schedules[0], is_recurring: e.target.checked }])}
              className="w-4 h-4 rounded border-[var(--theme-border)] bg-[var(--theme-surface-soft)] text-[var(--theme-accent)] focus:ring-[var(--theme-accent)]" />
            <span className="text-[11px] text-[var(--theme-text-secondary)]">Təkrarlayan (həftəlik)</span>
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Mətbəx növü</label>
          <div className="flex gap-2">
            {['dine_in', 'takeaway', 'delivery'].map(type => (
              <button key={type} type="button" onClick={() => toggleDiningType(type)}
                className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${(form.dining_type || []).includes(type) ? 'bg-[var(--theme-accent)] text-black' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                {type === 'dine_in' ? 'İçəridə' : type === 'takeaway' ? 'Götür' : 'Çatdır'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </form>
  );

  if (typeof document === 'undefined') return null;
  const layoutId = campaign ? `campaign-${campaign.id}` : `campaign-new`;

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="campaign-mobile"
            layoutId={layoutId}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="fixed inset-0 z-[120] flex flex-col bg-card md:hidden"
            style={{ overflowY: 'auto' }}
          >
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08] bg-card">
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all">
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 text-center">
                <h2 className="text-[15px] font-serif font-bold text-white">{campaign ? t('edit_campaign') : t('new_campaign')}</h2>
                <p className="text-[8px] uppercase tracking-[0.2em] text-gold/60 mt-0.5">{t('premium_marketing')}</p>
              </div>
              <div className="w-9" />
            </div>

            <div className="flex-1 pb-28">
              {formBody}
            </div>

            <div className="fixed bottom-0 inset-x-0 px-4 pb-7 pt-3 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent z-10">
              <button
                type="button" onClick={onSubmit as any} disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-40 bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)]"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                {campaign ? t('edit_campaign').toUpperCase() : t('new_campaign').toUpperCase()}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[120] hidden md:flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div
              layoutId={layoutId}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16, transition: { duration: 0.12, ease: 'easeOut' } }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="relative w-full max-w-xl rounded-2xl bg-card border border-white/[0.08] shadow-2xl overflow-y-auto max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-card border-b border-white/[0.06]">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white">{campaign ? t('edit_campaign') : t('new_campaign')}</h2>
                  <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-[0.3em]">{t('premium_marketing')}</p>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-panel)] transition-all">
                  <X size={16} />
                </button>
              </div>
              {formBody}
              <div className="sticky bottom-0 px-5 py-3.5 bg-card border-t border-white/[0.06]">
                <button type="button" onClick={onSubmit as any} disabled={isSubmitting}
                  className="w-full py-3 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-40 bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)]"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {campaign ? t('edit_campaign').toUpperCase() : t('new_campaign').toUpperCase()}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
};

export default CampaignModal;