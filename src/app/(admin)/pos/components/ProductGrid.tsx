'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { Product } from '../../orders/types';
import type { ModifierSelection } from '../types';

interface ProductGridProps {
  products: Product[];
  categories: { id: string; name: string }[];
  onAddProduct: (product: Product) => void;
  cartCounts: Record<string, number>;
}

export function ProductGrid({ products, categories, onAddProduct, cartCounts }: ProductGridProps) {
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
        const name = (p as any)[`name_${language}`] || p.name || '';
        return name.toLowerCase().includes(q);
      });
    }
    return list;
  }, [products, categoryFilter, search, language]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative flex-shrink-0 mb-3">
        <Search size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${lightMode ? 'text-gray-400' : 'text-white/25'}`} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Məhsul axtar..."
          className={`w-full rounded-xl pl-10 pr-9 py-3 text-sm outline-none transition-all ${lightMode ? 'bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-gray-400 shadow-sm' : 'bg-white/[0.04] border border-white/[0.07] text-white placeholder:text-white/20 focus:border-white/25'}`}
        />
        {search && (
          <button onClick={() => setSearch('')} className={`absolute right-3 top-1/2 -translate-y-1/2 ${lightMode ? 'text-gray-400 hover:text-gray-600' : 'text-white/20 hover:text-white/50'}`}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto flex-shrink-0 pb-2 mb-3 scrollbar-none">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold tracking-wider transition-all ${
            !categoryFilter
              ? lightMode ? 'bg-gray-900 text-white shadow-sm' : 'bg-gold text-black'
              : lightMode ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200' : 'bg-white/[0.06] text-white/50 hover:text-white/80'
          }`}
        >
          Hamısı
        </button>
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id === categoryFilter ? null : c.id)}
            className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
              categoryFilter === c.id
                ? lightMode ? 'bg-gray-900 text-white shadow-sm' : 'bg-gold text-black'
                : lightMode ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200' : 'bg-white/[0.06] text-white/50 hover:text-white/80'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Products */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full py-12 ${lightMode ? 'text-gray-400' : 'text-white/15'}`}>
            <p className="text-sm">{t('not_found')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(product => {
              const name = (product as any)[`name_${language}`] || product.name;
              const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              const count = cartCounts[product.id] || 0;
              return (
                <motion.button
                  key={product.id}
                  layout
                  initial={false}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onAddProduct(product)}
                  className={`relative rounded-xl border flex flex-col overflow-hidden transition-all ${lightMode ? 'bg-white border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md' : 'bg-[#141414] border-white/[0.07] hover:bg-white/[0.05]'}`}
                >
                  <div className={`aspect-square w-full overflow-hidden flex items-center justify-center ${lightMode ? 'bg-gray-100/50' : 'bg-white/[0.03]'}`}>
                    {product.image_url ? (
                      <img src={product.image_url} alt={name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className={`text-lg font-black ${lightMode ? 'text-gray-400' : 'text-white/20'}`}>{initials}</span>
                    )}
                  </div>
                  <div className="px-2.5 pb-2.5 pt-2">
                    <p className={`text-xs font-semibold truncate leading-tight ${lightMode ? 'text-gray-800' : 'text-white/80'}`}>{name}</p>
                    <p className={`text-xs font-black mt-0.5 ${lightMode ? 'text-amber-700' : 'text-gold'}`}>{product.price.toFixed(2)} ₼</p>
                  </div>
                  {count > 0 && (
                    <motion.span
                      key={count}
                      initial={{ scale: 1.4 }}
                      animate={{ scale: 1 }}
                      className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center shadow-lg ${lightMode ? 'bg-amber-600 text-white' : 'bg-gold text-black'}`}
                    >
                      {count}
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
