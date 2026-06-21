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
        const name = (language === 'az' ? p.name_az : language === 'en' ? p.name_en : p.name_ru) || p.name || '';
        return name.toLowerCase().includes(q);
      });
    }
    return list;
  }, [products, categoryFilter, search, language]);

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar - Modern & Flat */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('search_products' as any)}
          className={`w-full rounded-[20px] pl-12 pr-4 py-4 text-sm outline-none transition-all ${lightMode ? 'bg-[#f4f4f7] text-gray-900 focus:bg-gray-100' : 'bg-white/[0.08] text-white focus:bg-white/[0.12]'}`}
        />
      </div>

      {/* Categories - Clean Gold Active State */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-none">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
            !categoryFilter
              ? 'bg-gold text-black shadow-lg shadow-gold/20'
              : 'bg-[#f4f4f7] dark:bg-white/[0.08] text-[#8e8e93] hover:bg-gray-200 dark:hover:bg-white/[0.12]'
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
              className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-gold text-black shadow-lg shadow-gold/20'
                  : 'bg-[#f4f4f7] dark:bg-white/[0.08] text-[#8e8e93] hover:bg-gray-200 dark:hover:bg-white/[0.12]'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Product List - Modern Card Design */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(product => {
            const name = (language === 'az' ? product.name_az : language === 'en' ? product.name_en : product.name_ru) || product.name;
            const count = cartCounts[product.id] || 0;
            const hasNoStock = outOfStock?.has(product.id);
            return (
              <motion.button
                key={product.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => onAddProduct(product)}
                className="group relative flex flex-col rounded-[28px] bg-[#f4f4f7] dark:bg-white/[0.08] p-4 transition-all duration-300 hover:shadow-xl hover:bg-[#ebebef] dark:hover:bg-white/[0.12]"
              >
                {hasNoStock && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 rounded-[28px] backdrop-blur-[2px]">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest bg-rose-600 px-3 py-1.5 rounded-full shadow-lg">Stok yoxdur</span>
                  </div>
                )}
                <div className="aspect-square w-full overflow-hidden rounded-[20px] bg-white/50 dark:bg-black/20">
                  {product.image_url ? (
                    <img src={product.image_url} alt={name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-black opacity-20 uppercase">{name.slice(0, 2)}</div>
                  )}
                </div>
                <div className="pt-4 px-1">
                  <p className={`text-sm font-bold truncate leading-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>{name}</p>
                  <p className="text-sm font-black mt-2 text-gold">₼ {product.price.toFixed(2)}</p>
                </div>
                {count > 0 && (
                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full text-[11px] font-black flex items-center justify-center shadow-xl bg-gold text-black border-2 border-white dark:border-zinc-900">
                    {count}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
