'use client';

import { useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Plus, Clock, Star, Heart, ShoppingCart, Ban } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { LiquidCategoryNavbar } from './LiquidCategoryNavbar';
import type { PosProduct } from '../types/shared';
import { playHapticSound } from '@/lib/haptic';

export type Product = PosProduct;

export interface ProductGridRef {
  openEditor: (productId: string) => void;
  toggleEditor: (productId: string) => void;
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
const TOTAL_COLUMNS = 4;

const FILTER_TABS = [
  { id: 'all' as const, labelKey: 'all_products', icon: Search },
  { id: 'recent' as const, labelKey: 'recent', icon: Clock },
  { id: 'popular' as const, labelKey: 'popular', icon: Star },
  { id: 'favorites' as const, labelKey: 'favorites', icon: Heart },
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'recent' | 'popular' | 'favorites'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined);
  const [noteForProduct, setNoteForProduct] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, number>>({});
  const [pulseMap, setPulseMap] = useState<Record<string, number>>({});
  const [bounceMap, setBounceMap] = useState<Record<string, number>>({});

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const expandedIdRef = useRef<string | null>(null);

  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  useEffect(() => {
    setSelectedVariant(undefined);
    setNoteForProduct('');
    setQty(1);
    setSelectedModifiers({});
  }, [expandedId]);

  useImperativeHandle(ref, () => ({
    openEditor: (productId: string) => {
      const el = cardRefs.current[productId];
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        el.scrollIntoView({ block: 'center' });
      }
      setExpandedId(productId);
    },
    toggleEditor: (productId: string) => {
      if (expandedIdRef.current === productId) {
        setExpandedId(null);
        return;
      }
      const el = cardRefs.current[productId];
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        el.scrollIntoView({ block: 'center' });
      }
      setExpandedId(productId);
    }
  }), []);

  const navbarCategories = useMemo(() => {
    const comboCat: { id: string; name: string } = { id: COMBO_TAB, name: t('combos') };
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
    return list;
  }, [products, combos, categoryFilter, search, language, outOfStock]);

  const handleAdd = (item: GridItem) => {
    if (item._isCombo) {
      if (onAddCombo && item._raw) onAddCombo(item._raw);
    } else {
      onAddProduct(item);
    }
  };

  const handleCardClick = (item: GridItem) => {
    handleAdd(item);
    setPulseMap(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
    setBounceMap(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
    setTimeout(() => {
      setPulseMap(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, 1200);
    setTimeout(() => {
      setBounceMap(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, 800);
  };

  const handleClose = () => {
    setExpandedId(null);
  };

  const expandedItem = filtered.find(item => item.id === expandedId);

  const getColumnAnchor = (index: number) => {
    const colIndex = index % TOTAL_COLUMNS;
    const isRightHalf = colIndex >= 2;
    if (isRightHalf) return { side: 'right' as const, origin: 'top right' as const };
    return { side: 'left' as const, origin: 'top left' as const };
  };

  const cardBg = lightMode
    ? 'bg-white border-zinc-200 shadow-lg shadow-black/5'
    : 'bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20';
  const cardText = lightMode ? 'text-gray-900' : 'text-white';
  const cardPrice = lightMode ? 'text-gray-900' : 'text-white';
  const cardSecondary = lightMode ? 'text-gray-500' : 'text-white/50';
  const comboLabelBg = lightMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/10 text-amber-400';
  const expandedBg = lightMode ? 'bg-white border-zinc-200' : 'bg-[#1a1a1a] border-white/10';
  const expandedText = lightMode ? 'text-gray-900' : 'text-white';
  const expandedSecondary = lightMode ? 'text-gray-600' : 'text-white/60';
  const expandedInputBg = lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black' : 'bg-white/5 border-white/10 text-white';
  const expandedInputPlaceholder = lightMode ? 'text-zinc-400' : 'text-white/40';
  const expandedBtnBg = lightMode ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-emerald-500 hover:bg-emerald-600';
  const compactImgBg = lightMode ? 'bg-zinc-100' : 'bg-white/50 dark:bg-black/20';
  const compactPriceLine = lightMode ? 'text-gray-400' : 'text-white/40';
  const compactPriceMuted = lightMode ? 'text-gray-500' : 'text-white/50';

  return (
    <div className="flex flex-col h-full relative">
      {/* Search Bar — Apple style focus: border + glow + soft shadow */}
      <div className="relative mb-4 flex-shrink-0">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('search_products' as any)}
           className={`peer w-full rounded-3xl pl-12 pr-4 py-3 text-sm outline-none border bg-[var(--theme-surface-muted)] transition-all duration-200
             ${lightMode
               ? 'text-gray-900 border-zinc-300 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 shadow-md shadow-black/5 focus:shadow-[0_0_20px_rgba(120,120,120,0.25)]'
               : 'text-white border-white/10 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/20 shadow-md shadow-black/20 focus:shadow-[0_0_20px_rgba(120,120,120,0.3)]'}`}
        />
      </div>

      {/* Filter Tabs */}
      <div className="mb-3 flex-shrink-0 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
              activeFilter === tab.id
                ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                : lightMode ? 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
            }`}
          >
            <tab.icon size={12} />
            {t(tab.labelKey as any)}
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

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto pr-1 pt-2 relative z-0">
        {outOfStock && outOfStock.size > 0 && (
          <div className="flex items-center justify-end mb-3 flex-shrink-0 pr-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${lightMode ? 'bg-rose-50 text-rose-500' : 'bg-rose-500/10 text-rose-400'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              {outOfStock.size} {t('out_of_stock')}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 relative overflow-visible">
          {filtered.map((item, index) => {
            const name = (language === 'az' ? item.name_az : language === 'en' ? item.name_en : item.name_ru) || item.name;
            const count = cartCounts[item.id] || 0;
            const isCombo = item._isCombo;
            const isOutOfStock = outOfStock?.has(item.id);
            const isExpanded = expandedId === item.id;
            const anchor = getColumnAnchor(index);
            const layoutId = `product-card-${item.id}`;

            return (
              <div
                key={`${isCombo ? 'combo-' : ''}${item.id}`}
                ref={el => { cardRefs.current[item.id] = el; }}
                className="relative col-span-1 row-span-1 overflow-visible"
              >
                {/* 1. Compact Card (always present, serves as morph target) */}
                   <motion.div
                   layoutId={layoutId}
                   transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
                   whileTap={{ scale: 0.96, transition: { type: 'spring', stiffness: 400, damping: 35, mass: 0.4 } }}
                   className={`relative flex flex-col rounded-4xl border overflow-hidden cursor-pointer shadow-card ${cardBg} ${
                     isOutOfStock ? 'opacity-50 grayscale border-rose-500/30' : ''
                   }`}
                   onClick={() => { if (!isOutOfStock) { handleCardClick(item); } }}
                   style={{ zIndex: isExpanded ? 1 : 0 }}
                 >
                  {/* Cart count badge - always visible, bounces smoothly without disappearing */}
                   {count > 0 && (
                     <motion.div
                       key={`overlay-badge-${item.id}`}
                       initial={{ scale: 1 }}
                       animate={bounceMap[item.id] ? { scale: [1, 1.1, 1.02, 1] } : { scale: 1 }}
                       transition={{ duration: bounceMap[item.id] ? 0.4 : 0.2, ease: "easeOut" }}
                        className={`absolute top-2 left-2 z-20 flex items-center gap-1 rounded-full px-2.5 py-1 border text-xs font-black tabular-nums ${lightMode ? 'bg-zinc-900/80 border-zinc-800 text-white' : 'bg-zinc-900/80 border-zinc-700 text-white'}`}
                        >
                        <ShoppingCart size={10} className="text-white" />
                        <motion.span
                          key={`count-${item.id}-${count}`}
                          initial={{ scale: 1 }}
                          animate={pulseMap[item.id] ? { scale: [1, 1.15, 1.03, 1] } : { scale: 1 }}
                          transition={{ duration: pulseMap[item.id] ? 0.5 : 0.25, ease: "easeOut" }}
                          className="text-xs font-black text-white whitespace-nowrap">
                          {count}
                        </motion.span>
                      </motion.div>
                  )}
                  {isOutOfStock && (
                    <div className={`absolute top-2 left-2 z-20 flex items-center gap-1 rounded-full px-2 py-1 border text-xs font-black tabular-nums ${lightMode ? 'bg-zinc-900/80 border-zinc-800 text-white' : 'bg-zinc-900/80 border-zinc-700 text-white'}`}>
                      <Ban size={10} className="text-white" />
                      <span className="whitespace-nowrap">{t('out_of_stock')}</span>
                    </div>
                  )}

                  <motion.div
                    className="flex flex-col h-full p-3"
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-3xl bg-white/50 dark:bg-black/20">
                      {item.image_url && !failedImages.has(item.image_url) ? (
                        <img src={retryingImages.has(item.image_url) ? `${item.image_url}?t=${Date.now()}` : item.image_url} alt={name}
                          onError={() => {
                            const url = item.image_url!;
                            const cnt = (retryCount[url] || 0) + 1;
                            setRetryCount(prev => ({ ...prev, [url]: cnt }));
                            if (cnt >= 2) { setFailedImages(prev => new Set(prev).add(url)); }
                            else { setRetryingImages(prev => new Set(prev).add(url)); }
                          }}
                          onLoad={() => {
                            if (retryingImages.has(item.image_url!)) { setRetryingImages(prev => { const s = new Set(prev); s.delete(item.image_url!); return s; }); }
                          }}
                           className="w-full h-full object-cover group-hover:scale-110" loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl font-black opacity-20 uppercase">{name.slice(0, 2)}</div>
                      )}
                    </div>
                    <div className="pt-4 px-1 space-y-1">
                      {item.effective_price?.campaign_badge && (
                        <span className="inline-block text-xs font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full mb-1"
                          style={{ color: item.effective_price.campaign_badge || '#D4AF37', backgroundColor: `${item.effective_price.campaign_badge || '#D4AF37'}20` }}>
                          {item.effective_price.campaign_label || t('savings') || 'Endirim'}
                        </span>
                      )}
                      <p className={`text-sm font-bold truncate leading-tight ${cardText}`}>{name}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-2">
                          {item.effective_price && item.effective_price.effective_price < item.effective_price.base_price ? (
                            <>
                              <p className={`text-sm font-black ${cardPrice}`}>₼ {item.effective_price.effective_price.toFixed(2)}</p>
                              <p className={`text-xs font-bold line-through ${compactPriceLine}`}>₼ {item.effective_price.base_price.toFixed(2)}</p>
                            </>
                          ) : (
                            <p className={`text-sm font-black ${cardPrice}`}>₼ {(item.effective_price?.effective_price ?? item.price)?.toFixed(2)}</p>
                          )}
                        </div>
                         <div className="flex items-center gap-1.5 min-w-0">
                           {isCombo && (
                             <span className={`inline-block text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${comboLabelBg}`}>
                               {t('combos')}
                             </span>
                           )}
                         </div>
                      </div>
                    </div>
                    </motion.div>
                  </motion.div>

                  {/* 2. Expanded Floating Popover (sibling of compact card, same layoutId) */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      layoutId={layoutId}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                      className={`absolute top-0 z-50 w-[440px] rounded-4xl border shadow-elevated overflow-hidden ${
                        anchor.side === 'right' ? 'right-0' : 'left-0'
                      } ${expandedBg}`}
                      style={{
                        transformOrigin: anchor.origin,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-5 overflow-y-auto max-h-[calc(100vh-2rem)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/10 shrink-0">
                              {expandedItem?.image_url && !failedImages.has(expandedItem.image_url) ? (
                                <img src={retryingImages.has(expandedItem.image_url) ? `${expandedItem.image_url}?t=${Date.now()}` : expandedItem.image_url} alt={name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl font-black opacity-20 uppercase text-white">{(name || '?').slice(0, 2)}</div>
                              )}
                            </div>
                            <div>
                              <p className={`text-xl font-black ${expandedText}`}>{name}</p>
                              <p className={`text-lg font-black ${expandedSecondary}`}>₼ {(expandedItem?.effective_price?.effective_price ?? expandedItem?.price)?.toFixed(2)}</p>
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleClose(); }} className="p-2 rounded-xl border border-white/10 text-white hover:bg-white/10 transition-colors">
                            <X size={20} />
                          </button>
                        </div>

                        <div className="mt-4 space-y-4">
                          <div>
                            <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Miqdar:</span>
                            <div className="flex items-center gap-3 mt-2">
                              <div className={`flex items-center gap-1 rounded-xl border overflow-hidden ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}>
                                <button onClick={(e) => { e.stopPropagation(); setQty(Math.max(1, qty - 1)); }} className={`px-4 py-2 text-sm font-black transition-colors ${lightMode ? 'text-zinc-500 hover:bg-zinc-100' : 'text-white hover:bg-white/10'}`}>−</button>
                                <span className={`px-4 py-2 text-sm font-black tabular-nums min-w-[2.5rem] text-center ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{qty}</span>
                                <button onClick={(e) => { e.stopPropagation(); setQty(qty + 1); }} className={`px-4 py-2 text-sm font-black transition-colors ${lightMode ? 'text-zinc-500 hover:bg-zinc-100' : 'text-white hover:bg-white/10'}`}>+</button>
                              </div>
                            </div>
                          </div>

                          {(expandedItem?.variants?.length ?? 0) > 0 && (
                            <div>
                              <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('option' as any)}</span>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(expandedItem?.variants ?? []).map((v: any) => (
                                  <button key={v.id} onClick={(e) => { e.stopPropagation(); setSelectedVariant(v.id); }} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${selectedVariant === v.id ? 'bg-blue-500 text-white border-blue-500' : lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-100' : 'border-white/10 text-white/80 hover:bg-white/10'}`}>
                                    {v.name || v.title || `#${v.id.slice(0, 6)}`} {v.price ? `(+₼${Number(v.price).toFixed(2)})` : ''}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {(expandedItem?.modifiers?.length ?? 0) > 0 && (
                            <div>
                              <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Modifikatorlar:</span>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(expandedItem?.modifiers ?? []).map((m: any) => {
                                  const mQty = selectedModifiers[m.id] || 0;
                                  return (
                                    <div key={m.id || m.name} className={`flex items-center gap-1 pl-3 pr-1 py-1 rounded-xl text-xs font-bold transition-all border ${mQty > 0 ? 'bg-blue-500 text-white border-blue-500' : lightMode ? 'border-zinc-200 text-zinc-600' : 'border-white/10 text-white/80'}`}>
                                      <span className="whitespace-nowrap">{m.name} {m.price ? `+₼${Number(m.price).toFixed(2)}` : ''}</span>
                                      {mQty > 0 && (
                                        <>
                                          <button onClick={(e) => { e.stopPropagation(); setSelectedModifiers(p => ({ ...p, [m.id]: Math.max(0, (p[m.id] || 0) - 1) })); }} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/20">−</button>
                                          <span className="min-w-[1rem] text-center tabular-nums">{mQty}</span>
                                        </>
                                      )}
                                      <button onClick={(e) => { e.stopPropagation(); setSelectedModifiers(p => ({ ...p, [m.id]: (p[m.id] || 0) + 1 })); }} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/20">+</button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div>
                            <input type="text" value={noteForProduct} onChange={(e) => { e.stopPropagation(); setNoteForProduct(e.target.value); }} placeholder={t('add_note')} className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-colors ${expandedInputBg} focus:border-zinc-400/50`} onClick={(e) => e.stopPropagation()} />
                          </div>

                          <button onClick={(e) => {
                            e.stopPropagation();
                            if (expandedItem) {
                              const selectedMods = Object.entries(selectedModifiers)
                                .filter(([, q]) => q > 0)
                                .map(([id, q]) => {
                                  const mod = (expandedItem.modifiers || []).find((x: any) => x.id === id);
                                  return { id, name: mod?.name || '', price: Number(mod?.price || 0), quantity: q };
                                });
                              if (expandedItem._isCombo && onAddCombo) {
                                onAddCombo(expandedItem._raw);
                              } else {
                                onAddProduct({ ...expandedItem, special_notes: noteForProduct || undefined, variant_id: selectedVariant || undefined, __expanded: true, __qty: qty, __modifiers: selectedMods } as any);
                              }
                            }
                            setNoteForProduct('');
                            setSelectedVariant(undefined);
                            setSelectedModifiers({});
                            setQty(1);
                            handleClose();
                          }} className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-black uppercase tracking-wider hover:opacity-90 transition-all active:scale-95 shadow-lg`}
                          style={{ backgroundColor: '#10b981' }}
                          >
                            <Plus size={18} /> {t('add')}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});