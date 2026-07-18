'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Zap, Loader2, Search, CheckCircle2, Percent, Gift, Sparkles, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Campaign, Product, Category } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { toast } from '@/lib/toast';
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
  target_type: 'product' | 'category' | 'combo';
  target_id?: string;
  target_ids?: string[];
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
  const { lightMode } = useTheme();
  const campaignTypes = CAMPAIGN_TYPES(t);

  const rule = form.rules[0] || { rule_type: 'percentage' as const };

  useEffect(() => {
    if (open) {
      setStep(campaign ? 3 : 1);
      setShowAdvanced(false);
    }
  }, [open, !!campaign]);

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

  const toggleProductTarget = (productId: string) => {
    const currentIds = form.targets[0]?.target_ids || [];
    const nextIds = currentIds.includes(productId)
      ? currentIds.filter(id => id !== productId)
      : [...currentIds, productId];
    updateTargets([{ ...form.targets[0], target_ids: nextIds, target_id: nextIds[0] || '' }]);
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

    const hasTargets = form.targets[0]?.target_ids?.length || form.targets[0]?.target_id;
    if (!hasTargets && form.targets[0]?.target_type !== 'combo') {
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

  const [step, setStep] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const STEP_TITLES = ['Növ', 'Hədəf', 'Parametrlər', 'Vaxt'];

  const isHappyHour = rule.rule_type === 'happy_hour';
  const isPercentage = rule.rule_type === 'percentage' || rule.rule_type === 'happy_hour';

  const selectedProductIds = form.targets[0]?.target_ids || (form.targets[0]?.target_id ? [form.targets[0].target_id] : []);

  const btnPrimary = lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black';
  const btnPrimaryHover = lightMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-200';

  const formBody = (
    <form noValidate onSubmit={handleSubmit} className="w-full overflow-hidden flex flex-col">
      {/* ── Stepper ── */}
      <div className="px-4 md:px-6 pt-4 pb-3 flex items-center gap-1.5">
        {STEP_TITLES.map((title, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <React.Fragment key={title}>
              <button type="button" onClick={() => setStep(n)}
                className="flex items-center gap-2 group">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${active ? `${btnPrimary}` : done ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                  {done ? '✓' : n}
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider hidden sm:inline ${active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)]'}`}>{title}</span>
              </button>
              {n < STEP_TITLES.length && <span className={`flex-1 h-px ${done ? 'bg-emerald-500/30' : 'bg-[var(--theme-border)]'}`} />}
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex-1 px-4 md:px-6 py-2 overflow-y-auto" style={{ maxHeight: '62vh' }}>
        <AnimatePresence mode="wait">
        {/* STEP 1 — TYPE */}
        {step === 1 && (<motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }} className="space-y-5">
          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Kampaniya nə üçündür?</label>
            <div className="grid grid-cols-2 gap-2.5">
              {campaignTypes.map((ct) => (
                <button key={ct.id} type="button" onClick={() => {
                  const newType = ct.id as Campaign['type'];
                  let defaultRule: RuleForm = { rule_type: 'percentage' };
                  if (newType === 'FIXED_AMOUNT') defaultRule = { rule_type: 'fixed_amount', fixed_amount: 0 };
                  else if (newType === 'BUY_X_PAY_Y') defaultRule = { rule_type: 'buy_x_pay_y', buy_quantity: 2, pay_quantity: 1 };
                  else if (newType === 'BUY_X_GET_Y') defaultRule = { rule_type: 'buy_x_get_y', buy_quantity: 2, free_quantity: 1 };
                  else if (newType === 'HAPPY_HOUR') defaultRule = { rule_type: 'happy_hour', percentage: 20, start_time: '14:00', end_time: '17:00', weekdays: [1,2,3,4,5] };
                  else if (newType === 'FREE_DELIVERY') defaultRule = { rule_type: 'free_delivery', delivery_min_order: 30 };
                  else if (newType === 'COMBO') defaultRule = { rule_type: 'combo', combo_discount_type: 'fixed', combo_discount_value: 0 };
                  onFormChange({ ...form, type: newType, rules: [defaultRule], targets: [{ target_type: 'product', target_ids: [], target_id: '' }] });
                }}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${form.type === ct.id ? 'bg-[var(--theme-surface)] border-[var(--theme-border-strong)]' : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] hover:border-[var(--theme-border-strong)]'}`}>
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${form.type === ct.id ? `${btnPrimary}` : 'bg-[var(--theme-surface)] text-[var(--theme-text-muted)]'}`}>
                    <ct.icon size={16} strokeWidth={1.6} />
                  </span>
                  <span className={`text-[13px] font-semibold ${form.type === ct.id ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{ct.label}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>)}

        {/* STEP 2 — TARGET (no whole_order / Sifariş tab) */}
        {step === 2 && (<motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }} className="space-y-5">
          <div className="space-y-4">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Harada işləsin?</label>
            <div className="flex gap-2">
              {['product', 'category', 'combo'].map(targetType => (
                <button key={targetType} type="button" onClick={() => updateTargets([{ target_type: targetType as any, target_ids: [], target_id: '' }])}
                  className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${form.targets[0]?.target_type === targetType ? `${btnPrimary}` : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                  {targetType === 'product' ? 'Məhsul' : targetType === 'category' ? 'Kateqoriya' : 'Kombo'}
                </button>
              ))}
            </div>

            {(form.targets[0]?.target_type === 'product' || form.targets[0]?.target_type === 'category') && (
              <div className="space-y-3">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
                  <input type="text" placeholder={form.targets[0]?.target_type === 'product' ? 'Məhsul axtar...' : 'Kateqoriya axtar...'} value={productSearch} onChange={(e) => onProductSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all" />
                </div>

                {form.targets[0]?.target_type === 'product' && categories.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    <button type="button" onClick={() => onProductSearch('')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${!productSearch ? `${btnPrimary}` : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                      Hamısı
                    </button>
                    {categories.map(cat => (
                      <button key={cat.id} type="button" onClick={() => onProductSearch(cat.name)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${productSearch === cat.name ? `${btnPrimary}` : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}

                {selectedProductIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedProductIds.map(id => {
                      const selected = form.targets[0]?.target_type === 'product'
                        ? products.find(p => p.id === id)
                        : categories.find(c => c.id === id);
                      if (!selected) return null;
                      return (
                        <span key={selected.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--theme-surface)] border border-[var(--theme-border-strong)] text-[11px] font-semibold text-[var(--theme-text)]">
                          {('image_url' in selected && selected.image_url) && <img src={selected.image_url as string} alt="" className="w-4 h-4 rounded object-cover" />}
                          {selected.name}
                          <button type="button" onClick={() => {
                            const nextIds = selectedProductIds.filter(sid => sid !== id);
                            updateTargets([{ ...form.targets[0], target_ids: nextIds, target_id: nextIds[0] || '' }]);
                          }}
                            className="ml-1 text-[var(--theme-text-muted)] hover:text-red-400 transition-colors"><X size={12} /></button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="max-h-[240px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                  <div className="grid grid-cols-2 gap-2">
                    {(form.targets[0]?.target_type === 'product' ? filteredProducts : categories).map(item => {
                      const isSelected = form.targets[0]?.target_type === 'product'
                        ? selectedProductIds.includes(item.id)
                        : form.targets[0]?.target_id === item.id;
                      return (
                        <button key={item.id} type="button" onClick={() => {
                          if (form.targets[0]?.target_type === 'product') {
                            toggleProductTarget(item.id);
                          } else {
                            updateTargets([{ ...form.targets[0], target_id: item.id }]);
                          }
                        }}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isSelected ? 'bg-[var(--theme-surface)] border-[var(--theme-border-strong)]' : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] hover:bg-[var(--theme-panel)]'}`}>
                          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                            {'image_url' in item && item.image_url ? (
                              <img src={item.image_url as string} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[var(--theme-text-muted)] text-[9px] font-black">{item.name.slice(0,2).toUpperCase()}</div>
                            )}
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className={`text-[11px] font-semibold truncate ${isSelected ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{item.name}</p>
                            {'price' in item && <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">₼{(item as any).price}</p>}
                          </div>
                          {isSelected && <CheckCircle2 size={14} className="text-[var(--theme-text)] flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>)}

        {/* STEP 3 — PARAMETERS */}
        {step === 3 && (<motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('campaign_name')}</label>
              <input type="text" value={form.name || form.title} onChange={(e) => onFormChange({ ...form, name: e.target.value, title: e.target.value })}
                className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
                placeholder={language === 'en' ? 'e.g: Roll Week Discount' : language === 'ru' ? 'напр: Скидка Недели Роллов' : 'Məs: Roll Həftəsi Endirimi'} />
            </div>

            {isPercentage && (
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
                  <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{rule.rule_type === 'buy_x_pay_y' ? 'Ödə' : 'Pulsuz'}</label>
                  <input type="number" min="0" value={rule.rule_type === 'buy_x_pay_y' ? (rule.pay_quantity || 1) : (rule.free_quantity || 1)} onChange={(e) => updateRule(rule.rule_type === 'buy_x_pay_y' ? { pay_quantity: parseInt(e.target.value) || 1 } : { free_quantity: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all" />
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

            {isHappyHour && (
              <>
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
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Günlər</label>
                  <div className="flex gap-2">
                    {WEEKDAYS.map(day => (
                      <button key={day.id} type="button" onClick={() => toggleWeekday(day.id)}
                        className={`w-10 h-10 rounded-xl text-[11px] font-bold transition-all ${(rule.weekdays || []).includes(day.id) ? `${btnPrimary}` : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>)}

        {/* STEP 4 — SCHEDULE */}
        {step === 4 && (<motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }} className="space-y-5">
          <div className="space-y-4">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Vaxt (İstəyə bağlı)</label>
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
                className="w-4 h-4 rounded border-[var(--theme-border)] bg-[var(--theme-surface-soft)] accent-[var(--theme-text)]" />
              <span className="text-[11px] text-[var(--theme-text-secondary)]">Təkrarlayan (həftəlik)</span>
            </label>

            <div className="pt-2 border-t border-[var(--theme-border)]">
              <button type="button" onClick={() => setShowAdvanced(v => !v)}
                className="w-full flex items-center justify-between py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all">
                <span>Advanced</span>
                <ChevronLeft size={16} className={`rotate-90 transition-transform ${showAdvanced ? 'rotate-[270deg]' : ''}`} />
              </button>
              {showAdvanced && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Priority</label>
                    <input type="number" min="0" value={form.priority || 0} onChange={(e) => onFormChange({ ...form, priority: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] outline-none" />
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.stackable} onChange={(e) => onFormChange({ ...form, stackable: e.target.checked })} className="w-4 h-4 rounded border-[var(--theme-border)] bg-[var(--theme-surface-soft)] accent-[var(--theme-text)]" />
                    <span className="text-[12px] text-[var(--theme-text-secondary)]">Stackable</span>
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={form.requires_coupon} onChange={(e) => onFormChange({ ...form, requires_coupon: e.target.checked })} className="w-4 h-4 rounded border-[var(--theme-border)] bg-[var(--theme-surface-soft)] accent-[var(--theme-text)]" />
                      <span className="text-[12px] text-[var(--theme-text-secondary)]">Coupon tələb et</span>
                    </label>
                    {form.requires_coupon && (
                      <input type="text" value={form.coupon_code} onChange={(e) => onFormChange({ ...form, coupon_code: e.target.value })} placeholder="Kupon kodu"
                        className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] outline-none" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-[var(--theme-text-muted)]">Max istifadə</label>
                      <input type="number" min="0" value={form.max_uses ?? ''} onChange={(e) => onFormChange({ ...form, max_uses: e.target.value ? parseInt(e.target.value) : null })}
                        className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--theme-text)] outline-none" placeholder="∞" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-[var(--theme-text-muted)]">Müştəri başına</label>
                      <input type="number" min="0" value={form.max_uses_per_customer ?? ''} onChange={(e) => onFormChange({ ...form, max_uses_per_customer: e.target.value ? parseInt(e.target.value) : null })}
                        className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--theme-text)] outline-none" placeholder="∞" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Dining Type</label>
                    <div className="flex gap-2">
                      {['dine_in', 'takeaway', 'delivery'].map(type => (
                        <button key={type} type="button" onClick={() => toggleDiningType(type)}
                          className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${(form.dining_type || []).includes(type) ? `${btnPrimary}` : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]'}`}>
                          {type === 'dine_in' ? 'İçəridə' : type === 'takeaway' ? 'Götür' : 'Çatdır'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.auto_apply} onChange={(e) => onFormChange({ ...form, auto_apply: e.target.checked })} className="w-4 h-4 rounded border-[var(--theme-border)] bg-[var(--theme-surface-soft)] accent-[var(--theme-text)]" />
                    <span className="text-[12px] text-[var(--theme-text-secondary)]">Auto Apply</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </motion.div>)}
        </AnimatePresence>
      </div>
    </form>
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="campaign-mobile"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-[120] flex flex-col bg-card md:hidden"
            style={{ overflowY: 'auto' }}
          >
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08] bg-card">
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all">
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 text-center">
                <h2 className="text-[15px] font-serif font-bold text-[var(--theme-text)]">{campaign ? t('edit_campaign') : t('new_campaign')}</h2>
                <p className="text-[8px] uppercase tracking-[0.2em] text-[var(--theme-text-muted)] mt-0.5">{t('premium_marketing')}</p>
              </div>
              <div className="w-9" />
            </div>

            <div className="flex-1 pb-28">
              {formBody}
            </div>

            <div className="fixed bottom-0 inset-x-0 px-4 pb-7 pt-3 bg-gradient-to-t from-[var(--theme-bg)] via-[var(--theme-bg)]/95 to-transparent z-10 flex gap-2">
              {step > 1 && (
                <button type="button" onClick={() => setStep(s => s - 1)} className="flex-1 py-3.5 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] border border-[var(--theme-border)]">
                  <ChevronLeft size={18} /> Geriyə
                </button>
              )}
              {step < 4 ? (
                <button type="button" onClick={() => setStep(s => s + 1)} className={`flex-[2] py-3.5 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 ${btnPrimary} ${btnPrimaryHover}`}>
                  İrəli
                </button>
              ) : (
                <button type="button" onClick={onSubmit as any} disabled={isSubmitting} className={`flex-[2] py-3.5 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-40 ${btnPrimary} ${btnPrimaryHover}`}>
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {campaign ? t('edit_campaign').toUpperCase() : t('new_campaign').toUpperCase()}
                </button>
              )}
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
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-xl rounded-2xl bg-card border border-white/[0.08] shadow-2xl overflow-y-auto max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-card border-b border-white/[0.06]">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-[var(--theme-text)]">{campaign ? t('edit_campaign') : t('new_campaign')}</h2>
                  <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-[0.3em]">{t('premium_marketing')}</p>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-panel)] transition-all">
                  <X size={16} />
                </button>
              </div>
              {formBody}
              <div className="sticky bottom-0 px-5 py-3.5 bg-card border-t border-white/[0.06] flex gap-2">
                {step > 1 && (
                  <button type="button" onClick={() => setStep(s => s - 1)} className="py-3 px-4 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] border border-[var(--theme-border)]">
                    <ChevronLeft size={18} /> Geriyə
                  </button>
                )}
                {step < 4 ? (
                  <button type="button" onClick={() => setStep(s => s + 1)} className={`flex-1 py-3 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 ${btnPrimary} ${btnPrimaryHover}`}>
                    İrəli
                  </button>
                ) : (
                  <button type="button" onClick={onSubmit as any} disabled={isSubmitting} className={`flex-1 py-3 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-40 ${btnPrimary} ${btnPrimaryHover}`}>
                    {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    {campaign ? t('edit_campaign').toUpperCase() : t('new_campaign').toUpperCase()}
                  </button>
                )}
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
