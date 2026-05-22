'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingBag, TrendingUp, TrendingDown, Search, Download, Filter } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import GoldSelect from '@/components/GoldSelect';

interface ProductPerf {
  id: string;
  name: string;
  image?: string;
  category: string;
  views: number;
  sold: number;
  conversion: string | number;
  revenue: string | number;
}

interface Category {
  name: string;
}

interface Props {
  productPerformance: ProductPerf[];
  categories: Category[];
  getCategoryTranslation: (cat: any) => { name: string };
}

const StatsProductTable = ({ productPerformance, categories, getCategoryTranslation }: Props) => {
  const { t } = useLanguage();
  const [prodSearch, setProdSearch] = useState('');
  const [prodCategory, setProdCategory] = useState('all');

  // Only show categories that have at least one product in current period
  const activeCategories = useMemo(() => {
    const activeCatNames = new Set(productPerformance.map(p => p.category).filter(Boolean));
    return categories.filter(cat => activeCatNames.has(cat.name));
  }, [productPerformance, categories]);

  // Reset to 'all' if selected category no longer has data
  useEffect(() => {
    if (prodCategory !== 'all' && !activeCategories.some(c => c.name === prodCategory)) {
      setProdCategory('all');
    }
  }, [activeCategories, prodCategory]);

  const filtered = productPerformance.filter(p =>
    p.name.toLowerCase().includes(prodSearch.toLowerCase()) &&
    (prodCategory === 'all' || p.category === prodCategory)
  );

  const handleExport = () => {
    const rows = productPerformance.map(p => `${p.name},${p.views},${p.sold},${p.conversion}%,₼${Number(p.revenue).toFixed(2)}`).join('\n');
    const csv = `${t('stats_col_product')},${t('stats_col_views')},${t('stats_col_sales')},${t('stats_col_conversion')},${t('stats_col_revenue')}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'stats.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-card border border-white/5 rounded-2xl">
      {/* Header */}
      <div className="p-4 md:p-8 border-b border-white/5">
        <div className="flex items-center justify-between gap-3 mb-3 md:mb-4">
          <h3 className="text-base md:text-xl font-serif font-bold text-white flex items-center gap-2 md:gap-3">
            <ShoppingBag size={16} className="text-gold md:w-5 md:h-5" />
            {t('stats_product_performance')}
          </h3>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/40 text-xs transition-all" title="Export CSV">
            <Download size={12} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gold/40" />
            <input
              value={prodSearch}
              onChange={e => setProdSearch(e.target.value)}
              placeholder={t('stats_search_product')}
              className="w-full pl-8 pr-3 py-2 bg-white/[0.04] border border-white/[0.07] rounded-xl text-sm text-white placeholder:text-white/20 focus:border-white/20 outline-none transition-all"
            />
          </div>
          <GoldSelect
            value={prodCategory}
            options={[
              { value: 'all', label: t('stats_all_categories'), icon: <Filter size={11} strokeWidth={1.5} /> },
              ...activeCategories.map(cat => ({ value: cat.name, label: getCategoryTranslation(cat as any).name }))
            ]}
            onChange={setProdCategory}
            className="w-32 md:w-40"
          />
        </div>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden divide-y divide-white/[0.04]">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-white/20 text-xs uppercase tracking-widest">{t('stats_no_sales')}</p>
        ) : filtered.map((p, i) => {
          const convNum = Number(p.conversion);
          const isGood = convNum >= 20;
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-white/15 text-xs font-mono w-4 flex-shrink-0">{i + 1}</span>
              <div className="w-8 h-8 bg-black border border-white/5 overflow-hidden rounded-lg flex items-center justify-center flex-shrink-0">
                {p.image ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <span className="text-[10px]">🍣</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[13px] font-semibold truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-white/30 text-[10px]">{p.sold}x</span>
                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${convNum >= 80 ? 'bg-gold' : isGood ? 'bg-gold/60' : 'bg-white/20'}`} style={{ width: `${Math.min(convNum * 2, 100)}%` }} />
                  </div>
                  <span className={`text-[10px] font-bold ${isGood ? 'text-gold' : 'text-white/30'}`}>{p.conversion}%</span>
                </div>
              </div>
              <span className="text-white font-bold text-sm tabular-nums flex-shrink-0">₼{Number(p.revenue).toFixed(0)}</span>
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/[0.02] border-b border-white/5">
              <th className="px-8 py-5 text-[10px] uppercase tracking-[0.3em] text-white/40 font-medium">{t('stats_col_product')}</th>
              <th className="px-8 py-5 text-[10px] uppercase tracking-[0.3em] text-white/40 font-medium text-center">{t('stats_col_views')}</th>
              <th className="px-8 py-5 text-[10px] uppercase tracking-[0.3em] text-white/40 font-medium text-center">{t('stats_col_sales')}</th>
              <th className="px-8 py-5 text-[10px] uppercase tracking-[0.3em] text-white/40 font-medium text-center">{t('stats_col_conversion')}</th>
              <th className="px-8 py-5 text-[10px] uppercase tracking-[0.3em] text-white/40 font-medium text-right">{t('stats_col_revenue')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="p-20 text-center text-white/20 uppercase tracking-widest text-xs">{t('stats_no_sales')}</td></tr>
            ) : (
              filtered.map((p) => {
                const convNum = Number(p.conversion);
                const isGood = convNum >= 20;
                return (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.01] transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-black border border-white/5 overflow-hidden rounded-lg flex items-center justify-center flex-shrink-0">
                          {p.image ? (
                            <img src={p.image} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center">
                              <span className="text-xs text-white/30">🍣</span>
                            </div>
                          )}
                        </div>
                        <span className="font-bold">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex items-center justify-center gap-1 text-white/60 font-medium">
                        {p.views}
                        {p.views > 30 ? <TrendingUp size={12} className="text-green-400" /> : p.views < 5 ? <TrendingDown size={12} className="text-red-400" /> : null}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex items-center justify-center gap-1 text-white/60 font-medium">
                        {p.sold}
                        {p.sold > 10 ? <TrendingUp size={12} className="text-green-400" /> : null}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden relative">
                          <div className={`h-full rounded-full transition-all ${convNum >= 80 ? 'bg-gold shadow-[0_0_10px_rgba(212,175,55,0.7)]' : isGood ? 'bg-gold shadow-[0_0_6px_rgba(212,175,55,0.4)]' : 'bg-white/25'}`} style={{ width: `${Math.min(convNum * 2, 100)}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${convNum >= 80 ? 'text-gold drop-shadow-[0_0_6px_rgba(212,175,55,0.8)]' : isGood ? 'text-gold' : 'text-white/40'}`}>{p.conversion}%</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right font-bold text-white">₼ {Number(p.revenue).toFixed(2)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StatsProductTable;
