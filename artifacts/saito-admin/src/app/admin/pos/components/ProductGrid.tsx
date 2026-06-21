'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosProduct } from '../types/shared';

export type Product = PosProduct;

interface ProductGridProps {
  products: PosProduct[];
  categories: { id: string; name: string }[];
  onAddProduct: (product: PosProduct) => void;
  cartCounts: Record<string, number>;
  outOfStock?: Set<string>;
}

export function ProductGrid({ products, categories, onAddProduct, cartCounts, outOfStock }: ProductGridProps) {
  const { language, t } = useLanguage();
  const { lightMode } = useTheme();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = products;
    if (categoryFilter) list = list.filter(p => p.category_id === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => {
        const localizedName = language === 'az' ? p.name_az : language === 'en' ? p.name_en : p.name_ru;
        const name = localizedName || p.name || '';
        return name.toLowerCase().includes(q);
      });
    }
    return list;
  }, [products, categoryFilter, search, language]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative flex-shrink-0 mb-4 px-1">
        <Search size={15} className={`absolute left-4 top-1/2 -translate-y-1/2 ${lightMode ? 'text-gray-400' : 'text-white/20'}`} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('search_products' as any)}
          className={`w-full rounded-2xl pl-11 pr-10 py-3.5 text-sm outline-none transition-all ${lightMode ? 'bg-[#efeff4] border-none text-gray-900 placeholder:text-gray-400 focus:bg-[#e5e5ea]' : 'bg-white/[0.08] border-none text-white placeholder:text-white/10 focus:bg-white/[0.12]'}`}
        />
        {search && (
          <button onClick={() => setSearch('')} className={`absolute right-4 top-1/2 -translate-y-1/2 ${lightMode ? 'text-gray-400' : 'text-white/20'}`}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Categories with Liquid Physics */}
      <div className="flex gap-2 overflow-x-auto flex-shrink-0 pb-3 mb-2 px-1 scrollbar-none">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`relative flex-shrink-0 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
            !categoryFilter
              ? 'bg-gray-900 text-white dark:bg-white dark:text-black shadow-lg'
              : 'bg-[#efeff4] dark:bg-white/[0.08] text-[#8e8e93] hover:bg-[#e5e5ea] dark:hover:bg-white/[0.12]'
          }`}
        >
          {t('all' as any)}
        </button>
        {categories.map(c => {
          const isActive = categoryFilter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(isActive ? null : c.id)}
              className={`relative flex-shrink-0 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-black shadow-lg'
                  : 'bg-[#efeff4] dark:bg-white/[0.08] text-[#8e8e93] hover:bg-[#e5e5ea] dark:hover:bg-white/[0.12]'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Products */}
      <div className="flex-1 overflow-y-auto pr-1 pt-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${categoryFilter || 'all'}__${search}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          >
            {filtered.length === 0 ? (
              <div className={`flex flex-col items-center justify-center h-full py-16 ${lightMode ? 'text-gray-400' : 'text-white/10'}`}>
                <p className="text-sm font-bold uppercase tracking-widest">{t('not_found' as any)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(product => {
                  const name = (language === 'az' ? product.name_az : language === 'en' ? product.name_en : product.name_ru) || product.name;
                  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                  const count = cartCounts[product.id] || 0;
                  const hasNoStock = outOfStock?.has(product.id);
                  return (
                    <motion.button
                      key={product.id}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => onAddProduct(product)}
                      className="group relative flex flex-col rounded-[32px] bg-[#efeff4] dark:bg-white/[0.08] p-3 transition-all duration-300 hover:shadow-xl hover:bg-[#e5e5ea] dark:hover:bg-white/[0.12]"
                    >
                      {hasNoStock && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 rounded-[32px] backdrop-blur-[2px]">
                          <span className="text-[10px] font-black text-white uppercase tracking-widest bg-rose-600 px-3 py-1.5 rounded-full shadow-lg">Stok yoxdur</span>
                        </div>
                      )}
                      <div className="aspect-square w-full overflow-hidden rounded-[24px] flex items-center justify-center bg-white/40 dark:bg-black/20">
                        {product.image_url ? (
                          <img src={product.image_url} alt={name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                        ) : (
                          <span className={`text-xl font-black ${lightMode ? 'text-gray-400' : 'text-white/10'}`}>{initials}</span>
                        )}
                      </div>
                      <div className="px-2 pt-3 pb-2">
                        <p className={`text-[13px] font-bold truncate leading-tight ${lightMode ? 'text-gray-900' : 'text-white/90'}`}>{name}</p>
                        <p className={`text-[13px] font-black mt-1 ${lightMode ? 'text-gray-900' : 'text-gold'}`}>{product.price.toFixed(2)} ₼</p>
                      </div>
                      {count > 0 && (
                        <motion.span
                          key={count}
                          initial={{ scale: 1.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full text-[11px] font-black flex items-center justify-center shadow-xl bg-gray-900 text-white dark:bg-white dark:text-black border-2 border-white dark:border-zinc-900"
                        >
                          {count}
                        </motion.span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
