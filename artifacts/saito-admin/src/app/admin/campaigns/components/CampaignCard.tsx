'use client';

import React from 'react';
import { Tag, Trash2, CalendarOff, Percent, Gift, Zap, Sparkles, Copy, Power, PowerOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Campaign, Product, Category } from '@/types';

const CAMPAIGN_ICONS: Record<string, React.ElementType> = {
  PERCENTAGE: Percent,
  BUY_X_PAY_Y: Gift,
  BUY_X_GET_Y: Gift,
  HAPPY_HOUR: Zap,
  FREE_DELIVERY: Sparkles,
  FIXED_AMOUNT: Percent,
  COMBO: Tag,
};

const CAMPAIGN_LABELS: Record<string, string> = {
  PERCENTAGE: 'Faiz Endirimi',
  BUY_X_PAY_Y: 'Al Ödə',
  BUY_X_GET_Y: 'Al Pulsuz',
  HAPPY_HOUR: 'Happy Hour',
  FREE_DELIVERY: 'Pulsuz Çatdırılma',
  FIXED_AMOUNT: 'Sabit Endirim',
  COMBO: 'Kombo',
};

interface Props {
  camp: Campaign & {
    rules?: any[];
    targets?: any[];
    schedules?: any[];
    total_orders?: number | null;
    unique_customers?: number | null;
    total_discount_given?: number | null;
    total_items_sold?: number | null;
    last_used_at?: string | null;
  };
  products: Product[];
  categories: Category[];
  onEdit: (c: Campaign) => void;
  onDelete: (id: string, title: string) => void;
  onDuplicate?: (c: Campaign) => void;
  onToggleActive?: (c: Campaign) => void;
}

const CampaignCard = ({ camp, products, categories, onEdit, onDelete, onDuplicate, onToggleActive }: Props) => {
  const { t, language } = useLanguage();
  const Icon = CAMPAIGN_ICONS[camp.type] || Tag;
  const rule = camp.rules?.[0];
  const target = camp.targets?.find((t: any) => t.target_type === 'product');
  const categoryTarget = camp.targets?.find((t: any) => t.target_type === 'category');
  const schedule = camp.schedules?.[0];
  const isActive = camp.status === 'active' && camp.is_active !== false;

  const targetIds = target?.target_ids || (target?.target_id ? [target.target_id] : []);
  const product = targetIds.length > 0 ? products.find(p => p.id === targetIds[0]) : null;
  const category = categoryTarget ? categories.find(c => c.id === categoryTarget.target_id) : null;

  const multiCount = targetIds.length;

  let discountDisplay = '—';
  if (rule) {
    if (rule.rule_type === 'percentage') discountDisplay = `${rule.percentage}%`;
    else if (rule.rule_type === 'fixed_amount') discountDisplay = `₼${rule.fixed_amount}`;
    else if (rule.rule_type === 'buy_x_pay_y') discountDisplay = `${rule.buy_quantity} al ${rule.pay_quantity} ödə`;
    else if (rule.rule_type === 'buy_x_get_y') discountDisplay = `${rule.buy_quantity} al ${rule.free_quantity} pulsuz`;
    else if (rule.rule_type === 'happy_hour') discountDisplay = `Happy Hour`;
    else if (rule.rule_type === 'free_delivery') discountDisplay = 'Pulsuz çatdırılma';
  }

  const targetDisplay = product?.name || category?.name || (multiCount > 1 ? `${multiCount} məhsul` : 'Seçilməmiş');
  const dateDisplay = schedule?.end_date ? new Date(schedule.end_date).toLocaleDateString('az-AZ') : null;

  return (
    <>
      {/* ── MOBILE card ── */}
      <motion.div
        whileTap={{ scale: 0.978 }}
        onClick={() => onEdit(camp)}
        className={`md:hidden group relative overflow-hidden rounded-3xl cursor-pointer border ${isActive ? 'bg-[var(--theme-panel)] border-[var(--theme-border-strong)]' : 'bg-[var(--theme-surface)] border-[var(--theme-border)]'}`}
      >
        {isActive && (
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
        )}
        <div className="flex gap-4 p-4">
          <div className="shrink-0">
            {product?.image_url ? (
              <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden border border-[var(--theme-border)] bg-[var(--theme-surface-soft)]">
                <img src={product.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                <Icon size={26} strokeWidth={1.3} className="text-[var(--theme-text-secondary)]" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 pr-12">
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-[var(--theme-text)] leading-snug line-clamp-2">{camp.name || camp.title}</p>
            </div>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] border-[var(--theme-accent-border)]">
                {CAMPAIGN_LABELS[camp.type] ?? camp.type}
              </span>
              <span className="text-[11px] text-[var(--theme-text-secondary)] font-bold">{discountDisplay}</span>
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {isActive ? (
                  <span className="relative flex w-2 h-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                    <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[var(--theme-border-strong)]" />
                )}
                <span className={`text-[10px] font-semibold uppercase tracking-widest ${isActive ? 'text-emerald-400/70' : 'text-[var(--theme-text-muted)]'}`}>
                  {isActive ? t('active') : t('passive')}
                </span>
              </div>
              {dateDisplay && (
                <>
                  <span className="w-px h-3 bg-[var(--theme-border)]" />
                  <div className="flex items-center gap-1 text-[10px] text-[var(--theme-text-muted)]">
                    <CalendarOff size={9} />
                    {dateDisplay}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(camp.id, camp.title || camp.name || ''); }}
          className="absolute top-4 right-4 w-9 h-9 rounded-xl flex items-center justify-center text-[var(--theme-text-muted)] hover:text-red-400 hover:bg-red-500/[0.08] transition-all"
        >
          <Trash2 size={17} />
        </button>
        
        {/* Quick actions */}
        <div className="absolute bottom-4 left-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {onDuplicate && (
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(camp); }}
              className="flex-1 py-2 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] hover:border-[var(--theme-accent-border)] transition-all">
              <Copy size={12} className="inline mr-1" /> Kopyala
            </button>
          )}
          {onToggleActive && (
            <button onClick={(e) => { e.stopPropagation(); onToggleActive(camp); }}
              className={`flex-1 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${isActive ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'}`}>
              {isActive ? <><PowerOff size={12} className="inline mr-1" /> Deaktiv</> : <><Power size={12} className="inline mr-1" /> Aktiv</>}
            </button>
          )}
        </div>
      </motion.div>

      {/* ── DESKTOP card ── */}
      <motion.div
        whileHover={{ y: -4, boxShadow: '0 18px 42px rgba(0,0,0,0.35)' }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        onClick={() => onEdit(camp)}
        className="hidden md:block bg-[var(--theme-panel)] backdrop-blur-sm border border-[var(--theme-border)] rounded-[20px] p-6 md:p-7 relative transition-all overflow-hidden cursor-pointer shadow-[0_4px_32px_rgba(0,0,0,0.35)]"
      >
        <div className="absolute top-4 left-4 flex items-center gap-1.5">
          {!isActive && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] text-[10px] font-bold uppercase tracking-wider border border-[var(--theme-border)]">
              Deaktiv
            </span>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(camp.id, camp.title || camp.name || ''); }}
          className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-red-500 hover:bg-red-500/[0.08] transition-all"
          title="Sil"
        >
          <Trash2 size={18} />
        </button>
        
        {/* Quick actions */}
        <div className="absolute top-4 left-4 flex items-center gap-1.5">
          {onDuplicate && (
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(camp); }}
              className="w-8 h-8 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] hover:border-[var(--theme-accent-border)] transition-all"
              title="Kopyala">
              <Copy size={14} />
            </button>
          )}
          {onToggleActive && (
            <button onClick={(e) => { e.stopPropagation(); onToggleActive(camp); }}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${isActive ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'}`}
              title={isActive ? 'Deaktiv et' : 'Aktiv et'}>
              {isActive ? <PowerOff size={14} /> : <Power size={14} />}
            </button>
          )}
        </div>

        <div className="flex items-start gap-4 mb-5 mt-10">
          <div className="w-12 h-12 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-secondary)] flex-shrink-0">
            <Icon size={22} strokeWidth={1.5} />
          </div>
          <div className="pr-12 flex-1 min-w-0">
            <h3 className="text-base font-bold text-[var(--theme-text)] mb-1 leading-tight truncate">{camp.name || camp.title}</h3>
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-widest text-[var(--theme-text-muted)] font-semibold">{CAMPAIGN_LABELS[camp.type] ?? camp.type}</span>
              <span className="text-[10px] text-[var(--theme-text-secondary)] font-bold">{discountDisplay}</span>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-center gap-3 p-2.5 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] overflow-hidden flex-shrink-0">
              {product?.image_url ? (
                <img src={product.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--theme-text-muted)]"><Tag size={14} /></div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[8px] uppercase tracking-widest text-[var(--theme-text-muted)] mb-0.5">
                {target ? 'Məhsul' : category ? 'Kateqoriya' : 'Hedef'}
              </p>
              <p className="text-xs font-semibold text-[var(--theme-text-secondary)] truncate">{targetDisplay}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-5 h-5">
              {isActive && <span className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />}
              <span className={`relative w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-white/20'}`} />
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${isActive ? 'text-emerald-400/80' : 'text-[var(--theme-text-muted)]'}`}>
              {isActive ? t('active') : t('passive')}
            </span>
          </div>
          <div className="text-right">
            {dateDisplay && (
              <div className="flex items-center gap-1 text-[9px] font-medium text-[var(--theme-text-muted)] mb-0.5">
                <CalendarOff size={9} />{dateDisplay}
              </div>
            )}
            <span className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-tight">{new Date(camp.created_at!).toLocaleDateString('az-AZ')}</span>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default CampaignCard;