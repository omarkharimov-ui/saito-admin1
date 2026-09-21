'use client';

import { useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Plus, Clock, Star, Heart, ShoppingCart, Ban, PackageOpen, AlertTriangle, RefreshCw, Pause, Check } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { LiquidCategoryNavbar } from './LiquidCategoryNavbar';
import type { PosProduct } from '../types/shared';
import { playHapticSound } from '@/lib/haptic';
import { appleBackdrop } from '@/lib/modal-transitions';
import { parseAllergens, resolveAllergenEntry, ALLERGEN_FALLBACK_ICON } from '@/lib/allergens';
import { useVirtualKeyboard } from './VirtualKeyboard';

export type Product = PosProduct;

export interface EditorPreset {
  variantId?: string | null;
  note?: string;
  modifiers?: Record<string, number>;
  quantity?: number;
  identity?: string;
  // State that must survive a modal re-open (was lost: "hold/resume ve course
  // send to kitchen etdikden sonra itir"):
  course?: string | null;
  is_hold?: boolean;
  // Allergens flagged on this line (customer allergy → kitchen warning),
  // persisted to order_items.allergens (jsonb).
  allergens?: string[];
}

export interface ProductGridRef {
  openEditor: (productId: string, preset?: EditorPreset) => void;
  toggleEditor: (productId: string, preset?: EditorPreset) => void;
}

interface ProductGridProps {
  products: PosProduct[];
  combos?: any[];
  categories: { id: string; name: string }[];
  /** Son/Məşur tab data (server-computed; favorites live in localStorage). */
  filterData?: { recent: { id: string; name: string }[]; popular: { id: string; name: string; qty: number }[] } | null;
  onAddProduct: (product: PosProduct) => void;
  onAddCombo?: (combo: any) => void;
  cartCounts: Record<string, number>;
  outOfStock?: Set<string>;
  variantsByProduct?: Record<string, any[]>;
  // G8 Batch 3: catalog load error + retry (parent owns catalog fetching).
  catalogError?: boolean;
  onRetryCatalog?: () => void;
}

const COMBO_TAB = '__combos__';

const FILTER_TABS = [
  { id: 'all' as const, labelKey: 'all_products', icon: Search },
  { id: 'recent' as const, labelKey: 'recent', icon: Clock },
  { id: 'popular' as const, labelKey: 'popular', icon: Star },
  { id: 'favorites' as const, labelKey: 'favorites', icon: Heart },
];

type GridItem = PosProduct & { _isCombo?: boolean; _raw?: any; variants?: any[]; modifiers?: any[]; modifier_groups?: any[] };

function AllergenBadges({ item }: { item: GridItem | undefined; lightMode?: boolean }) {
  const list = item ? parseAllergens(item.allergens) : [];
  if (list.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {list.slice(0, 6).map((a: any, i) => {
        const def = resolveAllergenEntry(a);
        const Icon = def?.icon ?? ALLERGEN_FALLBACK_ICON;
        const label = typeof a === 'object' ? (a.name || def?.label || a.code) : String(a);
        return (
          <span key={i} title={label} className="leading-none cursor-default select-none opacity-70">
            <Icon size={13} strokeWidth={2.2} />
          </span>
        );
      })}
    </div>
  );
}

export const ProductGrid = forwardRef<ProductGridRef, ProductGridProps>(function ProductGrid({
  products, combos, categories, onAddProduct, onAddCombo, cartCounts, outOfStock, variantsByProduct,
  catalogError, onRetryCatalog, filterData
}, ref) {
  const { language, t } = useLanguage();
  const { lightMode } = useTheme();
  // Yellow #2: when the on-screen keyboard is open, pad the grid's scroll
  // container so bottom fields/cards are never hidden under it.
  const { height: vkHeight } = useVirtualKeyboard();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [retryingImages, setRetryingImages] = useState<Set<string>>(new Set());
  const [retryCount, setRetryCount] = useState<Record<string, number>>({});
  const [activeFilter, setActiveFilter] = useState<'all' | 'recent' | 'popular' | 'favorites'>('all');
  // Favorites: per-browser set (localStorage) — the Sevimli tab.
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('saito_pos_favorites') || '[]')); } catch { return new Set(); }
  });
  const toggleFavorite = (productId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      try { localStorage.setItem('saito_pos_favorites', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined);
  const [noteForProduct, setNoteForProduct] = useState<string>('');
  // Course + hold of the line being edited (restored on re-open — were lost).
  const [editCourse, setEditCourse] = useState<string | null>(null);
  const [editIsHold, setEditIsHold] = useState(false);
  // Selected allergens (customer allergy flags) for the open product modal.
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, number>>({});
  const [pulseMap, setPulseMap] = useState<Record<string, number>>({});
  const [bounceMap, setBounceMap] = useState<Record<string, number>>({});

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const expandedIdRef = useRef<string | null>(null);
  const presetRef = useRef<EditorPreset | null>(null);
  // Aktiv sessiyanın redaktə identikliyi — handleModalAdd üçün (preset
  // one-shot consumed olduqdan sonra da əlçatan olmalıdır).
  const editIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  useEffect(() => {
    if (!expandedId) {
      presetRef.current = null;
      editIdentityRef.current = null;
      return;
    }
    // One-shot: preset yalnız bir dəfə tətbiq olunur, sonra təmizlənir ki,
    // növbəti kart toxunuşunda köhnə preset təsadüfən tətbiq olunmasın.
    const preset = presetRef.current;
    presetRef.current = null;
    editIdentityRef.current = preset?.identity ?? null;
    setSelectedVariant(preset?.variantId ?? undefined);
    setNoteForProduct(preset?.note ?? '');
    setEditCourse(preset?.course ?? null);
    setEditIsHold(!!preset?.is_hold);
    setSelectedAllergens(preset?.allergens ?? []);
    setQty(preset?.quantity && preset.quantity > 0 ? preset.quantity : 1);
    const sel: Record<string, number> = preset?.modifiers ? { ...preset.modifiers } : {};
    // House default: exclusive (max-1) groups preselect their default member
    // (is_default, fallback: first ₼0 option — e.g. "Standart" in serving
    // style) when no explicit selection exists for the group.
    const expandedProduct = products.find(p => p.id === expandedId) as GridItem | undefined;
    for (const g of ((expandedProduct?.modifier_groups as any[]) || [])) {
      if (Number(g.max_select) === 1 && Array.isArray(g.item_ids) && g.item_ids.length > 0) {
        const hasSel = g.item_ids.some((id: string) => (sel[id] || 0) > 0);
        if (!hasSel) {
          const items = ((expandedProduct?.modifiers as any[]) || []).filter(m => g.item_ids.includes(m.id));
          const def = items.find(m => m.is_default) || items.find(m => !Number(m.price));
          if (def) sel[def.id] = 1;
        }
      }
    }
    setSelectedModifiers(sel);
  }, [expandedId]);

  useImperativeHandle(ref, () => ({
    openEditor: (productId: string, preset?: EditorPreset) => {
      presetRef.current = preset ?? null;
      const el = cardRefs.current[productId];
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        el.scrollIntoView({ block: 'center' });
      }
      setExpandedId(productId);
    },
    toggleEditor: (productId: string, preset?: EditorPreset) => {
      if (expandedIdRef.current === productId) {
        setExpandedId(null);
        return;
      }
      presetRef.current = preset ?? null;
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

  const filtered = useMemo(() => {
    const items: GridItem[] = products.map(p => ({ ...p, _isCombo: false, variants: variantsByProduct?.[p.id] || [] }));

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
    // Son / Məşur / Sevimli tabs — previously rendered but never filtered
    // (the state was used only for the tab highlight). Applied last so search
    // keeps working on top of the filtered set.
    if (!search.trim() && activeFilter !== 'all') {
      if (activeFilter === 'recent' && filterData?.recent?.length) {
        const orderMap = new Map(filterData.recent.map((r, i) => [r.id, i]));
        list = list.filter(p => !p._isCombo && orderMap.has(p.id))
          .sort((a, b) => (orderMap.get(a.id)! - orderMap.get(b.id)!));
      } else if (activeFilter === 'popular' && filterData?.popular?.length) {
        const orderMap = new Map(filterData.popular.map((p, i) => [p.id, i]));
        list = list.filter(p => !p._isCombo && orderMap.has(p.id))
          .sort((a, b) => (orderMap.get(a.id)! - orderMap.get(b.id)!));
      } else if (activeFilter === 'favorites') {
        list = list.filter(p => !p._isCombo && favorites.has(p.id));
      }
    }
    return list;
  }, [products, combos, categoryFilter, search, language, outOfStock, activeFilter, filterData, favorites]);

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

  // Variantlı məhsulda heç nə seçilməyibsə default variantı seç.
  useEffect(() => {
    if (!expandedItem) return;
    const def = (expandedItem.variants || []).find((v: any) => v.is_default) || (expandedItem.variants || [])[0];
    if (def) setSelectedVariant(prev => prev ?? def.id);
  }, [expandedItem]);

  // Escape closes the product modal
  useEffect(() => {
    if (!expandedId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expandedId]);

  // Modal header price — variant + seçilmiş modifikatorlar daxil
  const selectedVariantObj = useMemo(
    () => (expandedItem?.variants ?? []).find((v: any) => v.id === selectedVariant),
    [expandedItem, selectedVariant]
  );
  const modifiersTotal = useMemo(() => Object.entries(selectedModifiers).reduce((sum, [id, q]) => {
    const m = (expandedItem?.modifiers ?? []).find((x: any) => x.id === id);
    return sum + Number(m?.price || 0) * (q || 0);
  }, 0), [expandedItem, selectedModifiers]);
  const variantUnitPrice = selectedVariantObj
    ? Number(selectedVariantObj.discount_price != null && selectedVariantObj.discount_price !== '' ? selectedVariantObj.discount_price : (selectedVariantObj.price ?? 0))
    : null;
  const baseUnitPrice = Number(expandedItem?.effective_price?.effective_price ?? expandedItem?.price ?? 0);
  // Single source of truth: must match addToCart's unit-price math (variant
  // base minus campaign amount; the no-variant path already uses
  // effective_price with the campaign baked in) so the modal total and the
  // cart line total never disagree.
  const effObj = (expandedItem as any)?.effective_price;
  const modalCampaignAmt = typeof effObj === 'object' && effObj ? Number(effObj.discount_amount) || 0 : 0;
  const modalUnitPrice = (variantUnitPrice != null
    ? (modalCampaignAmt > 0 ? Math.max(0, variantUnitPrice - modalCampaignAmt) : variantUnitPrice)
    : baseUnitPrice) + modifiersTotal;
  const modalName = (language === 'az' ? expandedItem?.name_az : language === 'en' ? expandedItem?.name_en : expandedItem?.name_ru) || expandedItem?.name || '';

  const handleModalAdd = () => {
    if (!expandedItem) return;
    const identity = editIdentityRef.current;
    editIdentityRef.current = null;
    if (expandedItem._isCombo && onAddCombo) {
      onAddCombo(expandedItem._raw);
    } else {
      const selectedMods = Object.entries(selectedModifiers)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => {
          const mod = (expandedItem.modifiers || []).find((x: any) => x.id === id);
          return { id, name: mod?.name || '', price: Number(mod?.price || 0), quantity: q };
        });
      onAddProduct({ ...expandedItem, special_notes: noteForProduct || undefined, variant_id: selectedVariant || undefined, __expanded: true, __qty: qty, __modifiers: selectedMods, __editOf: identity ? { identity } : undefined, __course: editCourse, __is_hold: editIsHold, __allergens: selectedAllergens } as any);
    }
    setNoteForProduct('');
    setSelectedVariant(undefined);
    setSelectedModifiers({});
    setEditCourse(null);
    setEditIsHold(false);
    setSelectedAllergens([]);
    setQty(1);
    handleClose();
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
             onClick={() => { setActiveFilter(tab.id); setCategoryFilter(null); }}
             className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap border transition-all duration-300 active:scale-[0.97] ${
               activeFilter === tab.id
                 ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/25'
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
          onChange={(id: string | null) => { setCategoryFilter(id); setActiveFilter('all'); }}
          allLabel={t('all' as any)}
        />
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto pr-1 pt-2 relative z-0" style={{ paddingBottom: vkHeight > 0 ? vkHeight + 12 : 0 }}>
        {catalogError ? (
          <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-amber-50 text-amber-500' : 'bg-amber-500/10 text-amber-400'}`}>
              <AlertTriangle size={28} strokeWidth={2} />
            </div>
            <p className={`text-sm font-black uppercase tracking-widest max-w-xs ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>{t('products_load_failed')}</p>
            {onRetryCatalog && (
              <button
                onClick={onRetryCatalog}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] ${lightMode ? 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100' : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'}`}
              >
                <RefreshCw size={14} />
                {t('retry')}
              </button>
            )}
          </div>
        ) : (products.length === 0 && (combos?.length ?? 0) === 0) ? (
          <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/5 text-white/30'}`}>
              <PackageOpen size={28} strokeWidth={1.8} />
            </div>
            <p className={`text-sm font-black uppercase tracking-widest max-w-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('no_products_available')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className={`w-14 h-14 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/5 text-white/30'}`}>
              <Search size={24} strokeWidth={1.8} />
            </div>
            <p className={`text-sm font-black uppercase tracking-widest max-w-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>
              {search.trim() ? t('no_products_found') : categoryFilter ? t('no_products_in_category') : t('no_products_available')}
            </p>
          </div>
        ) : (
          <>
        {outOfStock && outOfStock.size > 0 && (
          <div className="flex items-center justify-end mb-3 flex-shrink-0 pr-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${lightMode ? 'bg-rose-50 text-rose-500' : 'bg-rose-500/10 text-rose-400'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              {outOfStock.size} {t('out_of_stock')}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 relative overflow-visible">
          {filtered.map((item) => {
            const name = (language === 'az' ? item.name_az : language === 'en' ? item.name_en : item.name_ru) || item.name;
            const count = cartCounts[item.id] || 0;
            const isCombo = item._isCombo;
            const isOutOfStock = outOfStock?.has(item.id);
            const isExpanded = expandedId === item.id;
            const layoutId = `product-card-${item.id}`;

            return (
              <div
                key={`${isCombo ? 'combo-' : ''}${item.id}`}
                ref={el => { cardRefs.current[item.id] = el; }}
                className="relative col-span-1 row-span-1 overflow-visible"
              >
                {/* 1. Compact Card — expand zamanı DOM-dan ÇIXARILIR (yalnız bir
                    layoutId elementi qalır: modal). Beləcə framer "crossfade restore"
                    glitchi mümkün dehil — arxada geri qayıtacaq kart yoxdur. */}
                {isExpanded ? (
                  <div aria-hidden className="relative flex flex-col rounded-4xl opacity-0 pointer-events-none select-none">
                    <div className="aspect-square w-full" />
                    <div className="pt-4 px-1 pb-3 space-y-2">
                      <div className="h-4 rounded-xl bg-black/5 dark:bg-white/5" />
                      <div className="h-4 w-1/2 rounded-xl bg-black/5 dark:bg-white/5" />
                    </div>
                  </div>
                ) : (
                   <motion.div
                   layoutId={layoutId}
                   transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
                   whileTap={{ scale: 0.96, transition: { type: 'spring', stiffness: 400, damping: 35, mass: 0.4 } }}
                   className={`relative flex flex-col rounded-4xl border overflow-hidden cursor-pointer shadow-card ${cardBg} ${
                     isOutOfStock ? 'opacity-50 grayscale border-rose-500/30' : ''
                   }`}
                   onClick={() => { if (!isOutOfStock) { handleCardClick(item); } }}
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
                   {/* Favorite (Sevimli tab) — liquid press, spring fill */}
                   {!isCombo && (
                     <button
                       onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
                       aria-label="Sevimli"
                       className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-200 active:scale-90 hover:scale-105"
                       style={{ backgroundColor: 'rgba(0,0,0,0.28)' }}
                     >
                       <motion.span
                         key={String(favorites.has(item.id))}
                         initial={{ scale: 0.4, opacity: 0 }}
                         animate={{ scale: 1, opacity: 1 }}
                         transition={{ type: 'spring', stiffness: 500, damping: 20, mass: 0.6 }}
                       >
                         <Heart size={14} className={favorites.has(item.id) ? 'text-rose-500 fill-rose-500' : 'text-white/85'} />
                       </motion.span>
                     </button>
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
                          {item.effective_price.campaign_label || t('savings')}
                        </span>
                      )}
                      <p className={`text-sm font-bold truncate leading-tight ${cardText}`}>{name}</p>
                      <AllergenBadges item={item} />
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
                )}
               </div>
             );
           })}
        </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* 2. MƏHSUL MODALI (720px) — yalnız məhsulun öz seçimləri:       */}
      {/*    başlıq+qiymət+allergenlər, miqdar, modifikatorlar, qeyd, Add */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {expandedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={appleBackdrop}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
            onClick={handleClose}
          >
            <motion.div
              key="product-modal-card"
              layoutId={`product-card-${expandedItem.id}`}
              transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-[820px] rounded-4xl border shadow-elevated overflow-hidden ${expandedBg}`}
            >
              {/* Header: görsəl · ad · qiymət · allergenlər */}
              <div className={`flex items-start justify-between gap-4 p-5 pb-4 border-b ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-[72px] h-[72px] rounded-3xl overflow-hidden shrink-0 ${lightMode ? 'bg-zinc-100' : 'bg-white/10'}`}>
                    {expandedItem.image_url && !failedImages.has(expandedItem.image_url) ? (
                      <img src={retryingImages.has(expandedItem.image_url) ? `${expandedItem.image_url}?t=${Date.now()}` : expandedItem.image_url} alt={modalName} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center text-2xl font-black opacity-20 uppercase ${expandedText}`}>{(modalName || '?').slice(0, 2)}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xl font-black truncate leading-tight ${expandedText}`}>{modalName}</p>
                    <p className={`text-lg font-black mt-0.5 ${expandedSecondary}`}>₼ {modalUnitPrice.toFixed(2)}</p>
                    <div className="mt-1.5">
                      {/* Allergen selection — previously static badges only.
                          Tapping flags the allergen on this line (customer
                          allergy warning → kitchen); stored in
                          order_items.allergens. */}
                      {(() => {
                        const allergenList = parseAllergens(expandedItem.allergens);
                        if (allergenList.length === 0) return null;
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {allergenList.map((a: any) => {
                              const def = resolveAllergenEntry(a);
                              const Icon = def?.icon ?? ALLERGEN_FALLBACK_ICON;
                              const code = def?.code || (a && typeof a === 'object' ? (String(a.code || a.name || '')) : String(a));
                              if (!code) return null;
                              const on = selectedAllergens.includes(code);
                              return (
                                <button
                                  key={code}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAllergens(prev => on ? prev.filter(x => x !== code) : [...prev, code]);
                                  }}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold transition-all active:scale-95 ${on ? 'bg-red-500/15 border-red-500/60 text-red-500' : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/50'}`}
                                >
                                  <Icon size={10} /> {def?.label || (a && typeof a === 'object' ? (a.name || code) : code)}
                                  {on && <Check size={9} />}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleClose(); }} className={`p-2 rounded-xl border transition-all duration-200 hover:rotate-90 shrink-0 ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-red-400' : 'border-white/10 text-white hover:bg-white/10 hover:text-red-400'}`}>
                  <X size={20} />
                </button>
              </div>

              {/* Body: miqdar · variantlar · modifikatorlar · qeyd */}
              <div className="p-5 space-y-5 max-h-[55vh] overflow-y-auto">
                {/* Miqdar */}
                <div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Miqdar:</span>
                  <div className="flex items-center gap-3 mt-2">
                    <div className={`flex items-center rounded-2xl border overflow-hidden ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}>
                      <button onClick={() => setQty(Math.max(1, qty - 1))} className={`px-6 py-3 text-base font-black transition-colors active:scale-95 ${lightMode ? 'text-zinc-500 hover:bg-zinc-100' : 'text-white hover:bg-white/10'}`}>−</button>
                      <span className={`px-5 py-3 text-base font-black tabular-nums min-w-[3.5rem] text-center ${expandedText}`}>{qty}</span>
                      <button onClick={() => setQty(qty + 1)} className={`px-6 py-3 text-base font-black transition-colors active:scale-95 ${lightMode ? 'text-zinc-500 hover:bg-zinc-100' : 'text-white hover:bg-white/10'}`}>+</button>
                    </div>
                  </div>
                </div>

                {/* Variantlar */}
                {(expandedItem.variants?.length ?? 0) > 0 && (
                  <div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('option' as any)}</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(expandedItem.variants ?? []).map((v: any) => (
                        <button key={v.id} onClick={() => setSelectedVariant(v.id)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:-translate-y-px border active:scale-95 ${selectedVariant === v.id ? 'bg-blue-500 text-white border-blue-500' : lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-100' : 'border-white/10 text-white/80 hover:bg-white/10'}`}>
                          {v.name || v.title || `#${v.id.slice(0, 6)}`} {v.price ? `(+₼${Number(v.price).toFixed(2)})` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modifikatorlar */}
                {(expandedItem.modifiers?.length ?? 0) > 0 && (() => {
                  // QF2 P4: render modifier groups when the product has them
                  // (exclusive group max_select=1 behaves as radio; max is
                  // enforced on the + button; min/required shows a hint — the
                  // DB trigger enforce_item_modifiers is the final authority).
                  const groups: any[] = expandedItem.modifier_groups || [];
                  const groupedIds = new Set(groups.flatMap((g: any) => g.item_ids || []));
                  const flatMods: any[] = (expandedItem.modifiers || []).filter((m: any) => !groupedIds.has(m.id));

                  const setModQty = (id: string, q: number, group?: any) => {
                    setSelectedModifiers(prev => {
                      const next = { ...prev };
                      const isExclusive = !!group && Number(group.max_select) === 1;
                      // Exclusive group (max 1): picking one clears the rest,
                      // and the quantity itself is capped at 1 (radio, not stack).
                      if (isExclusive && q > 0) {
                        for (const oid of group.item_ids || []) if (oid !== id) next[oid] = 0;
                      }
                      next[id] = isExclusive ? Math.min(q, 1) : q;
                      return next;
                    });
                  };

                  const renderChip = (m: any, group?: any) => {
                    const mQty = selectedModifiers[m.id] || 0;
                    const selectedInGroup = group
                      ? (group.item_ids || []).filter((oid: string) => (selectedModifiers[oid] || 0) > 0).length
                      : 0;
                    const maxReached = !!group && group.max_select != null && mQty === 0 && selectedInGroup >= Number(group.max_select);
                    return (
                      <div key={m.id || m.name} className={`flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-px hover:shadow-sm border ${mQty > 0 ? (lightMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-blue-500/10 border-blue-500/40 text-blue-200') : lightMode ? 'border-zinc-200 text-zinc-600' : 'border-white/10 text-white/80'}`}>
                        <span
                          onClick={() => {
                            // Exclusive group: tapping an already-selected chip deselects it.
                            if (group && Number(group.max_select) === 1 && mQty > 0) setModQty(m.id, 0, group);
                            else if (!maxReached) setModQty(m.id, (selectedModifiers[m.id] || 0) + 1, group);
                          }}
                          className={`whitespace-nowrap select-none active:scale-95 ${maxReached ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {m.name} {m.price ? <span className={mQty > 0 ? 'opacity-70' : 'opacity-50'}>+₼{Number(m.price).toFixed(2)}</span> : ''}
                        </span>
                        {mQty > 0 && (
                          <>
                            <button onClick={() => setModQty(m.id, Math.max(0, (selectedModifiers[m.id] || 0) - 1), group)} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 active:scale-95">−</button>
                            <span className="min-w-[1.1rem] text-center tabular-nums text-xs font-bold">{mQty}</span>
                          </>
                        )}
                        <button onClick={() => setModQty(m.id, (selectedModifiers[m.id] || 0) + 1, group)} disabled={maxReached || (!!group && Number(group.max_select) === 1 && mQty >= 1)} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 disabled:opacity-30">+</button>
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-3">
                      {groups.length > 0 && groups.map((g: any) => {
                        const gItems: any[] = (expandedItem.modifiers || []).filter((m: any) => (g.item_ids || []).includes(m.id));
                        if (gItems.length === 0) return null;
                        const minNeed = Math.max(g.min_select ?? 0, g.is_required ? 1 : 0);
                        const picked = (g.item_ids || []).filter((oid: string) => (selectedModifiers[oid] || 0) > 0).length;
                        return (
                          <div key={g.id}>
                            <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                              {g.name}
                              {Number(g.max_select) === 1 ? ' · 1 seçim' : g.max_select != null ? ` · max ${g.max_select}` : ''}
                              {minNeed > 0 ? ' · məcburi' : ''}
                            </span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {gItems.map((m: any) => renderChip(m, g))}
                            </div>
                            {minNeed > 0 && picked < minNeed && (
                              <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#f59e0b' }}>
                                {picked} / {minNeed} — seçilməlidir
                              </p>
                            )}
                          </div>
                        );
                      })}
                      {flatMods.length > 0 && (
                        <div>
                          <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Modifikatorlar:</span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {flatMods.map((m: any) => renderChip(m))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Course (mərhələ) — preserved across re-opens (was lost) */}
                <div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Mərhələ:</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(['appetizer', 'main', 'dessert', 'drink'] as const).map(val => {
                      const on = editCourse === val;
                      const key = val === 'appetizer' ? 'course_appetizers' : val === 'main' ? 'course_mains' : val === 'dessert' ? 'course_desserts' : 'course_drinks';
                      return (
                        <motion.button
                          key={val}
                          whileTap={{ scale: 0.92 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                          onClick={() => setEditCourse(on ? null : val)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all duration-200 hover:-translate-y-px ${on ? (lightMode ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-400 text-black border-amber-400') : (lightMode ? 'bg-white/60 text-zinc-500 border-zinc-200' : 'bg-white/5 text-white/50 border-white/10')}`}
                        >
                          {t(key as any)}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
                {/* Hold state (read-only badge — hold/resume is managed in the cart) */}
                {editIsHold && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-orange-500/10 border border-orange-500/25 text-[11px] font-bold text-orange-600 dark:text-orange-300/90">
                    <Pause size={11} /> Saxlanılıb (hold)
                  </span>
                )}

                {/* Qeyd */}
                <div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Qeyd:</span>
                  <input type="text" value={noteForProduct} onChange={(e) => setNoteForProduct(e.target.value)} placeholder={t('add_note')} className={`mt-2 w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-colors ${expandedInputBg} focus:border-zinc-400/50`} />
                </div>
              </div>

              {/* Footer: ƏLAVƏ ET */}
              <div className="p-5 pt-0">
                <button onClick={handleModalAdd} className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-white text-sm font-black uppercase tracking-wider transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:brightness-105 active:translate-y-0 active:scale-[0.98] shadow-lg"
                style={{ backgroundColor: '#10b981' }}
                >
                  <Plus size={18} /> {t('add')}{qty > 1 ? ` · ${qty}` : ''}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});