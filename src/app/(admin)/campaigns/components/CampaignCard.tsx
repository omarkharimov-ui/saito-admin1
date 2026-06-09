'use client';

import React from 'react';
import { Tag, Trash2, CalendarOff, Percent, Gift, Zap, Sparkles, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Campaign, Product, Category } from '@/types';

const CAMPAIGN_ICONS: Record<string, React.ElementType> = {
  PERCENTAGE: Percent,
  BOGO: Gift,
  BUY2GET1: Gift,
  HAPPY_HOUR: Zap,
  FREE_DELIVERY: Sparkles,
};

const CAMPAIGN_LABELS: Record<string, string> = {
  PERCENTAGE: 'Faiz Endirimi',
  BOGO: 'Al 1, 1 Pulsuz',
  BUY2GET1: '2 Al, 1 Pulsuz',
  HAPPY_HOUR: 'Happy Hour',
  FREE_DELIVERY: 'Pulsuz Çatdırılma',
};

interface Props {
  camp: Campaign;
  products: Product[];
  categories: Category[];
  onEdit: (c: Campaign) => void;
  onDelete: (id: string, title: string) => void;
}

const CampaignCard = ({ camp, products, categories, onEdit, onDelete }: Props) => {
  const { t } = useLanguage();
  const Icon = CAMPAIGN_ICONS[camp.type] || Tag;
  const target = camp.target_type === 'product'
    ? products.find(p => p.id === camp.target_id)
    : categories.find(c => c.id === camp.target_id);
  const isActive = camp.status === 'active';

  return (
    <>
      {/* ── MOBILE card ── */}
      <motion.div
        whileTap={{ scale: 0.978 }}
        onClick={() => onEdit(camp)}
        className="md:hidden relative overflow-hidden rounded-3xl cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isActive ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)'}` }}
      >
        {isActive && (
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
        )}
        <div className="flex gap-4 p-4">
          {/* Left: product image or icon */}
          <div className="shrink-0">
            {camp.target_type === 'product' && (target as Product)?.image_url ? (
              <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden border border-white/[0.07]">
                <img src={(target as Product).image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div
                className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,rgba(212,175,55,0.10),rgba(212,175,55,0.04))', border: '1px solid rgba(212,175,55,0.15)' }}
              >
                <Icon size={26} strokeWidth={1.3} className="text-gold/70" />
              </div>
            )}
          </div>

          {/* Right: content */}
          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            {/* Top row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-white leading-snug line-clamp-2">{camp.title}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(camp.id, camp.title); }}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-white/25 active:text-red-400 active:bg-red-500/[0.08] transition-all shrink-0 mt-[-2px]"
              >
                <Trash2 size={17} />
              </button>
            </div>

            {/* Middle */}
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(212,175,55,0.10)', color: 'rgba(212,175,55,0.70)', border: '1px solid rgba(212,175,55,0.15)' }}
              >
                {CAMPAIGN_LABELS[camp.type] ?? camp.type}
              </span>
              {target && camp.target_type !== 'product' && (
                <span className="text-[11px] text-white/30 truncate">{target.name}</span>
              )}
            </div>

            {/* Bottom row */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1.5">
                {isActive ? (
                  <span className="relative flex w-2 h-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                    <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-white/15" />
                )}
                <span className={`text-[10px] font-semibold uppercase tracking-widest ${isActive ? 'text-emerald-400/70' : 'text-white/20'}`}>
                  {isActive ? t('active') : t('passive')}
                </span>
              </div>
              {(camp as any).end_date && (
                <>
                  <span className="w-px h-3 bg-white/[0.08]" />
                  <div className="flex items-center gap-1 text-[10px] text-white/20">
                    <CalendarOff size={9} />
                    {new Date((camp as any).end_date).toLocaleDateString('az-AZ')}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── DESKTOP card: original rich card ── */}
<motion.div
        whileHover={{ y: -4, boxShadow: '0 18px 42px rgba(0,0,0,0.35)' }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        onClick={() => onEdit(camp)}
        className="hidden md:block bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-sm border border-white/[0.08] rounded-[20px] p-6 md:p-7 relative group transition-all overflow-hidden cursor-pointer shadow-[0_4px_32px_rgba(0,0,0,0.35)]"
      >
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(camp.id, camp.title); }}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/15 hover:border-red-500/40 text-white/40 hover:text-red-500 transition-colors"
            title={t('delete_campaign')}
          >
            <Trash2 size={18} />
          </button>
        </div>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-gold flex-shrink-0">
            <Icon size={22} strokeWidth={1.5} />
          </div>
          <div className="pr-12 flex-1 min-w-0">
            <h3 className="text-base font-bold text-white mb-1 leading-tight truncate">{camp.title}</h3>
            <span className="text-[9px] uppercase tracking-widest text-gold/80 font-semibold">{CAMPAIGN_LABELS[camp.type] ?? camp.type}</span>
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-center gap-3 p-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] overflow-hidden flex-shrink-0">
              {camp.target_type === 'product' && (target as Product)?.image_url ? (
                <img src={(target as Product).image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20"><Tag size={14} /></div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[8px] uppercase tracking-widest text-white/25 mb-0.5">{camp.target_type === 'product' ? t('product') : t('category')}</p>
              <p className="text-xs font-semibold text-white/85 truncate">{target?.name || t('error_not_found')}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-5 h-5">
              {isActive && <span className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />}
              <span className={`relative w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-white/20'}`} />
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${isActive ? 'text-emerald-400/80' : 'text-white/25'}`}>
              {isActive ? t('active') : t('passive')}
            </span>
          </div>
          <div className="text-right">
            {(camp as any).end_date && (
              <div className="flex items-center gap-1 text-[9px] font-medium text-gold/60 mb-0.5">
                <CalendarOff size={9} />{new Date((camp as any).end_date).toLocaleDateString('az-AZ')}
              </div>
            )}
            <span className="text-[9px] text-white/20 uppercase tracking-tight">{new Date(camp.created_at!).toLocaleDateString('az-AZ')}</span>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default CampaignCard;
