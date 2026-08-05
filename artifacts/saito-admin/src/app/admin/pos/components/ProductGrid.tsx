'use client';

import { useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Plus, Clock, Star, Heart } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { LiquidCategoryNavbar } from './LiquidCategoryNavbar';
import type { PosProduct } from '../types/shared';

export type Product = PosProduct;

export interface ProductGridRef {
  openEditor: (productId: string) => void;
}

interface ProductGridProps {
  products: PosProduct[];
  combos?: any[];
  categories: { id: string; name: string }[];
  onAddProduct: (product: PosProduct) => void;
  onAddCombo?: (combo: any) => void;
  cartCounts: Record<string, number>;
  outOfStock?: Set<string>;
}

const COMBO_TAB = '__combos__';

const FILTER_TABS = [
  { id: 'all' as const, label: 'Hamısı', icon: Search },
  { id: 'recent' as const, label: 'Son', icon: Clock },
  { id: 'popular' as const, label: 'Məşhur', icon: Star },
  { id: 'favorites' as const, label: 'Sevimli', icon: Heart },
];

const STATIONS = [
  { value: 'kitchen', label: 'Mətbəx', icon: '🍳' },
  { value: 'bar', label: 'Bar', icon: '🍸' },
  { value: 'sushi', label: 'Sushi', icon: '🍣' },
  { value: 'hot', label: 'Hot', icon: '🔥' },
];

const COURSES = [
  { value: 'appetizers', label: 'Başlangıç' },
  { value: 'mains', label: 'Ana yemək' },
  { value: 'desserts', label: 'Desert' },
  { value: 'drinks', label: 'İçki' },
];

const PRIORITIES = [
  { value: 'normal', label: 'Normal', color: 'gray' },
  { value: 'high', label: 'Yüksək', color: 'orange' },
  { value: 'vip', label: 'VIP', color: 'purple' },
  { value: 'birthday', label: 'Ad günü', color: 'pink' },
  { value: 'allergy', label: 'Allerji', color: 'red' },
];

export const ProductGrid = forwardRef<ProductGridRef, ProductGridProps>(function ProductGrid({
  products, combos, categories, onAddProduct, onAddCombo, cartCounts, outOfStock
}, ref) {
  const { language, t } = useLanguage();
  const { lightMode } = useTheme();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [retryingImages, setRetryingImages] = useState<Set<string>>(new Set());
  const [retryCount, setRetryCount] = useState<Record<string, number>>({});
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'recent' | 'popular' | 'favorites'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined);
  const [noteForProduct, setNoteForProduct] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [originRect, setOriginRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setSelectedVariant(undefined);
    setNoteForProduct('');
    setQty(1);
  }, [expandedId]);

  useImperativeHandle(ref, () => ({
    openEditor: (productId: string) => {
      const el = cardRefs.current[productId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setExpandedId(productId);
    }
  }), []);

  const navbarCategories = useMemo(() => {
    const comboCat: { id: string; name: string } = { id: COMBO_TAB, name: 'Kombolar' };
    return [comboCat, ...categories];
  }, [categories]);

  type GridItem = PosProduct & { _isCombo?: boolean; _raw?: any; variants?: any[]; modifiers?: any[] };

  const filtered = useMemo(() => {
    const items: GridItem[] = products.map(p => ({ ...p, _isCombo: false }));

    if (combos) {
      for (const c of combos) {
        items.push({
          id: c.id,
          name: c.name,
          price: c.price,
          category_id: c.category_id,
          image_url: c.image_url,
          name_az: c.name_az,
          name_en: c.name_en,
          name_ru: c.name_ru,
          effective_price: c.effective_price && c.effective_price < c.price ? {
            base_price: c.price,
            effective_price: c.effective_price,
            discount_amount: c.price - c.effective_price,
            discount_type: null,
            campaign_id: null,
            campaign_label: null,
            campaign_badge: null,
          } : undefined,
          _isCombo: true,
          _raw: c,
        });
      }
    }

    let list = items;
    if (categoryFilter === COMBO_TAB) {
      list = list.filter(p => p._isCombo);
    } else if (categoryFilter) {
      list = list.filter(p => p.category_id === categoryFilter && !p._isCombo);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => {
        const name = (language === 'az' ? p.name_az : language === 'en' ? p.name_en : p.name_ru) || p.name || '';
        return name.toLowerCase().includes(q);
      });
    }
    if (hideOutOfStock) {
      list = list.filter(p => !(outOfStock?.has(p.id)));
    }
    return list;
  }, [products, combos, categoryFilter, search, language, hideOutOfStock, outOfStock]);

  const handleAdd = (item: GridItem) => {
    if (item._isCombo) {
      if (onAddCombo && item._raw) onAddCombo(item._raw);
    } else {
      onAddProduct(item);
    }
  };

  const handleCardClick = (item: GridItem) => {
    if (item._isCombo) return;
    handleAdd(item);
  };

  const handleClose = () => {
    setExpandedId(null);
    setOriginRect(null);
  };

  const expandedItem = filtered.find(item => item.id === expandedId);

  return (
    <div className="flex flex-col h-full relative">
      {/* Search Bar */}
      <div className="relative mb-4 flex-shrink-0 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('search_products' as any)}
            className={`w-full rounded-[20px] pl-12 pr-4 py-3 text-sm outline-none transition-all relative z-0 ${lightMode ? 'bg-[#efeff4] text-gray-900 focus:bg-[#e5e5ea]' : 'bg-white/[0.08] text-white focus:bg-white/[0.12]'}`}
          />
        </div>
        {outOfStock && outOfStock.size > 0 && (
          <button
            onClick={() => setHideOutOfStock(p => !p)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
              hideOutOfStock
                ? 'bg-rose-500 text-white border-rose-500'
                : lightMode ? 'bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-200' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'
            }`}
          >
            {outOfStock.size}
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="mb-3 flex-shrink-0 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
              activeFilter === tab.id
                ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                : lightMode ? 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Categories */}
      <div className="mb-4 flex-shrink-0">
        <LiquidCategoryNavbar
          categories={navbarCategories}
          activeId={categoryFilter}
          onChange={setCategoryFilter}
          allLabel={t('all' as any)}
        />
      </div>

      {/* Product Grid - frozen layout, overflow-visible for floating layer */}
      <div className="flex-1 overflow-y-auto pr-1 pt-2 relative z-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 relative overflow-visible">
          {filtered.map((item) => {
            const name = (language === 'az' ? item.name_az : language === 'en' ? item.name_en : item.name_ru) || item.name;
            const count = cartCounts[item.id] || 0;
            const isCombo = item._isCombo;
            const isOutOfStock = outOfStock?.has(item.id);
            const isExpanded = expandedId === item.id;

            return (
              <motion.div
                key={`${isCombo ? 'combo-' : ''}${item.id}`}
                ref={el => { cardRefs.current[item.id] = el; }}
                layout
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                className={`relative flex flex-col rounded-[28px] border overflow-hidden ${
                  isExpanded
                    ? 'col-span-2 row-span-2 z-20 shadow-2xl bg-[#1a1a1a] border-white/10'
                    : 'col-span-1 row-span-1 bg-[#f4f4f7] dark:bg-white/[0.08] border-[var(--theme-border)] shadow-[0_1px_3px_rgba(255,255,255,0.04)]'
                }`}
                onClick={() => { if (!isOutOfStock && !isCombo) handleCardClick(item); }}
              >
                {isOutOfStock && (
                  <div className="absolute top-2 right-2 z-20">
                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-white bg-rose-600 px-2 py-1 rounded-lg shadow-sm">
                      {t('out_of_stock') || 'Stokda yox'}
                    </span>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {isExpanded ? (
                    <motion.div
                      key="expanded"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col h-full"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/10 shrink-0">
                              {item.image_url && !failedImages.has(item.image_url) ? (
                                <img src={retryingImages.has(item.image_url) ? `${item.image_url}?t=${Date.now()}` : item.image_url} alt={name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl font-black opacity-20 uppercase text-white">{(name || '?').slice(0, 2)}</div>
                              )}
                            </div>
                            <div>
                              <p className="text-xl font-black text-white">{name}</p>
                              <p className="text-lg font-black text-white/80">₼ {(item.effective_price?.effective_price ?? item.price)?.toFixed(2)}</p>
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleClose(); }} className="p-2 rounded-xl border border-white/10 text-white hover:bg-white/10 transition-colors">
                            <X size={20} />
                          </button>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div>
                            <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Miqdar:</span>
                            <div className="flex items-center gap-3 mt-2">
                              <div className="flex items-center gap-1 rounded-xl border border-white/10 overflow-hidden">
                                <button onClick={(e) => { e.stopPropagation(); setQty(Math.max(1, qty - 1)); }} className="px-4 py-2 text-sm font-black text-white hover:bg-white/10 transition-colors">−</button>
                                <span className="px-4 py-2 text-sm font-black tabular-nums min-w-[2.5rem] text-center text-white">{qty}</span>
                                <button onClick={(e) => { e.stopPropagation(); setQty(qty + 1); }} className="px-4 py-2 text-sm font-black text-white hover:bg-white/10 transition-colors">+</button>
                              </div>
                            </div>
                          </div>

                          {(item.variants?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Variantlar:</span>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(item.variants ?? []).map((v: any) => (
                                  <button key={v.id} onClick={(e) => { e.stopPropagation(); setSelectedVariant(v.id); }} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${selectedVariant === v.id ? 'bg-blue-500 text-white border-blue-500' : 'border-white/10 text-white/80 hover:bg-white/10'}`}>
                                    {v.name || v.title || `#${v.id.slice(0, 6)}`} {v.price ? `(+₼${Number(v.price).toFixed(2)})` : ''}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {(item.modifiers?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Modifikatorlar:</span>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(item.modifiers ?? []).map((m: any) => (
                                  <span key={m.id || m.name} className="text-xs font-bold px-3 py-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">{m.name} +₼{Number(m.price || 0).toFixed(2)}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Stansiya:</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {STATIONS.map(st => (
                                <button key={st.value} onClick={(e) => { e.stopPropagation(); }} className="px-4 py-2 rounded-xl text-xs font-bold transition-all border border-white/10 text-white/80 hover:bg-white/10">
                                  {st.icon} {st.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Kurs:</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {COURSES.map(c => (
                                <button key={c.value} onClick={(e) => { e.stopPropagation(); }} className="px-4 py-2 rounded-xl text-xs font-bold transition-all border border-white/10 text-white/80 hover:bg-white/10">
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Tövsiyə:</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {PRIORITIES.map(p => (
                                <button key={p.value} onClick={(e) => { e.stopPropagation(); }} className="px-4 py-2 rounded-xl text-xs font-bold transition-all border border-white/10 text-white/80 hover:bg-white/10">
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <input type="text" value={noteForProduct} onChange={(e) => { e.stopPropagation(); setNoteForProduct(e.target.value); }} placeholder="Qeyd əlavə et..." className="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border border-white/10 bg-white/5 text-white placeholder:text-white/40 focus:border-blue-400/50 transition-colors" onClick={(e) => e.stopPropagation()} />
                          </div>

                          <button onClick={(e) => {
                            e.stopPropagation();
                            onAddProduct({ ...item, special_notes: noteForProduct || undefined, variant_id: selectedVariant || undefined } as any);
                            setNoteForProduct('');
                            setSelectedVariant(undefined);
                            setQty(1);
                            handleClose();
                          }} className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-white text-sm font-black uppercase tracking-wider hover:bg-emerald-600 transition-all active:scale-95 shadow-lg shadow-emerald-500/20">
                            <Plus size={18} /> Əlavə et
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="compact"
                      className="flex flex-col h-full p-4"
                    >
                      <div className="aspect-square w-full overflow-hidden rounded-[20px] bg-white/50 dark:bg-black/20">
                        {item.image_url && !failedImages.has(item.image_url) ? (
                          <img src={retryingImages.has(item.image_url) ? `${item.image_url}?t=${Date.now()}` : item.image_url} alt={name}
                            onError={() => {
                              const url = item.image_url!;
                              const count = (retryCount[url] || 0) + 1;
                              setRetryCount(prev => ({ ...prev, [url]: count }));
                              if (count >= 2) { setFailedImages(prev => new Set(prev).add(url)); }
                              else { setRetryingImages(prev => new Set(prev).add(url)); }
                            }}
                            onLoad={() => {
                              if (retryingImages.has(item.image_url!)) { setRetryingImages(prev => { const s = new Set(prev); s.delete(item.image_url!); return s; }); }
                            }}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl font-black opacity-20 uppercase">{name.slice(0, 2)}</div>
                        )}
                      </div>
                      <div className="pt-4 px-1">
                        {isCombo && (
                          <span className="inline-block text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full mb-1">Kombo</span>
                        )}
                        {item.effective_price?.campaign_badge && (
                          <span className="inline-block text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full mb-1"
                            style={{ color: item.effective_price.campaign_badge || '#D4AF37', backgroundColor: `${item.effective_price.campaign_badge || '#D4AF37'}20` }}>
                            {item.effective_price.campaign_label || 'Endirim'}
                          </span>
                        )}
                        <p className={`text-sm font-bold truncate leading-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>{name}</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          {item.effective_price && item.effective_price.effective_price < item.effective_price.base_price ? (
                            <>
                              <p className={`text-sm font-black ${lightMode ? 'text-gray-900' : 'text-white'}`}>₼ {item.effective_price.effective_price.toFixed(2)}</p>
                              <p className="text-[11px] font-bold line-through opacity-40">₼ {item.effective_price.base_price.toFixed(2)}</p>
                            </>
                          ) : (
                            <p className={`text-sm font-black ${lightMode ? 'text-gray-900' : 'text-white/60'}`}>₼ {(item.effective_price?.effective_price ?? item.price)?.toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
