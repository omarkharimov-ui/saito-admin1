'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit3, Trash2, Search, Filter, Tag, AlertCircle, X, Sparkles, Zap, FolderPlus, ChevronDown, ChevronRight, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Product, Category } from '@/types';
import { toast } from 'react-hot-toast';

/* ── Drag-to-dismiss Bottom Sheet ── */
function BottomSheet({ product, onClose, onEdit, onToggleStock, onDelete, getProductName, language, t }: {
  product: import('@/types').Product;
  onClose: () => void;
  onEdit: () => void;
  onToggleStock: () => void;
  onDelete: () => void;
  getProductName: (p: import('@/types').Product) => string;
  language: string;
  t: (k: any) => string;
}) {
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 300], [1, 0]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[110] md:hidden touch-none"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-[3px] touch-none"
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        style={{ y: dragY }}
        onDragEnd={(_, info) => { if (info.offset.y > 80) onClose(); else dragY.set(0); }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 bg-[#0a0a0a]/90 backdrop-blur-2xl border-t border-white/[0.08] rounded-t-3xl overflow-hidden touch-none overscroll-none"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-5">
          <div className="flex justify-center mb-4 cursor-grab active:cursor-grabbing">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          <p className="text-[9px] text-white/30 uppercase tracking-[0.3em] mb-1 text-center">{t('product_name_label') || 'MƏHSUL'}</p>
          <h2 className="text-[19px] font-serif text-white text-center leading-snug">{getProductName(product)}</h2>
        </div>

        {/* Actions */}
        <div className="px-5 pb-4 space-y-2 touch-auto">
          <motion.button whileTap={{ scale: 0.98 }} onClick={onEdit}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] active:bg-white/[0.08] transition-all text-left">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
              <Edit3 size={17} className="text-white/50" />
            </div>
            <span className="text-[15px] font-medium text-white/80">
              {language === 'ru' ? 'Редактировать' : language === 'en' ? 'Edit' : 'Redaktə et'}
            </span>
          </motion.button>

          <motion.button whileTap={{ scale: 0.98 }} onClick={onToggleStock}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] active:bg-white/[0.08] transition-all text-left">
            <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${product.is_in_stock ? 'bg-emerald-500/[0.08] border-emerald-500/20' : 'bg-white/[0.06] border-white/[0.08]'}`}>
              <span className={`w-3 h-3 rounded-full ${product.is_in_stock ? 'bg-emerald-400' : 'bg-white/30'}`} />
            </div>
            <span className="text-[15px] font-medium text-white/80">
              {product.is_in_stock
                ? (language === 'ru' ? 'Нет в наличии' : language === 'en' ? 'Mark out of stock' : 'Stokda olmadığını işarələ')
                : (language === 'ru' ? 'В наличии' : language === 'en' ? 'Mark in stock' : 'Stokda olduğunu işarələ')}
            </span>
          </motion.button>

          <motion.button whileTap={{ scale: 0.98 }} onClick={onDelete}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-red-500/[0.06] border border-red-500/[0.12] active:bg-red-500/[0.12] transition-all text-left">
            <div className="w-10 h-10 rounded-2xl bg-red-500/[0.10] border border-red-500/[0.15] flex items-center justify-center shrink-0">
              <Trash2 size={17} className="text-red-400/80" />
            </div>
            <span className="text-[15px] font-medium text-red-400/90">
              {language === 'ru' ? 'Удалить' : language === 'en' ? 'Delete' : 'Sil'}
            </span>
          </motion.button>
        </div>

        {/* Cancel */}
        <div className="px-5 pb-10 pt-1 touch-auto">
          <motion.button whileTap={{ scale: 0.98 }} onClick={onClose}
            className="w-full py-4 rounded-2xl bg-white/[0.05] border border-white/[0.07] text-white/50 text-[14px] font-semibold tracking-wide transition-all active:bg-white/[0.08]">
            {language === 'ru' ? 'Отмена' : language === 'en' ? 'Cancel' : 'Ləğv et'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface GroupedProducts {
  [catId: string]: { name: string; products: Product[] };
}

interface ProductTableProps {
  products: Product[];
  categories: Category[];
  groupedProducts: GroupedProducts;
  searchQuery: string;
  isBulkMode: boolean;
  selectedProducts: Set<string>;
  expandedCategories: string[];
  updating: boolean;
  onSearchChange: (v: string) => void;
  onOpenAddModal: () => void;
  onOpenCategoryModal: () => void;
  onEditProduct: (p: Product) => void;
  onDeleteProduct: (id: string, name: string) => void;
  onToggleStock: (p: Product) => void;
  onToggleCategory: (catId: string) => void;
  onToggleProductSelection: (id: string) => void;
  onSelectAllProducts: (catId: string) => void;
  onSetBulkMode: (v: boolean) => void;
  onSetBulkAction: (v: 'stock' | 'category' | null) => void;
  onConfirmDeleteAll: () => void;
  onEditCategory: (cat: Category) => void;
  onDeleteCategory: (id: string, name: string) => void;
  getCategoryName: (cat: Category) => string;
  getProductName: (p: Product) => string;
}

export function ProductTable({
  products, categories, groupedProducts, searchQuery, isBulkMode,
  selectedProducts, expandedCategories, updating,
  onSearchChange, onOpenAddModal, onOpenCategoryModal,
  onEditProduct, onDeleteProduct, onToggleStock, onToggleCategory,
  onToggleProductSelection, onSelectAllProducts, onSetBulkMode,
  onSetBulkAction, onConfirmDeleteAll, onEditCategory, onDeleteCategory,
  getCategoryName, getProductName,
}: ProductTableProps) {
  const { t, language } = useLanguage();
  const [toastShown, setToastShown] = useState(false);
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);

  const showToast = () => {
    if (selectedProducts.size === 0) {
      toast.dismiss('select-products');
      setTimeout(() => {
        toast.error(t('select_products_first'), {
          id: 'select-products',
          style: toastShown 
            ? { animation: 'toast-shake 0.45s cubic-bezier(0.36,0.07,0.19,0.97)' }
            : {}
        });
        setToastShown(true);
      }, 10);
      return true;
    }
    return false;
  };

  return (
    <>
      {/* Sticky toolbar - mobil 2 sətir, desktop 1 sətir */}
      <div className="sticky top-0 z-30 px-4 py-4 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.05] mb-8">
        <div className="flex flex-col sm:flex-row gap-3">

          {/* Search - bütün en */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" size={15} />
            <input
              type="text"
              placeholder={`${t('search')}...`}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl text-sm text-white placeholder:text-white/20 focus:border-white/20 outline-none transition-all"
            />
          </div>

          {/* Actions - mobil: aşağı sətir, desktop: yanında */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isBulkMode ? (
              <>
                <span className="hidden lg:flex px-3 py-2 rounded-xl bg-white/[0.03] text-white/30 border border-white/[0.06] text-xs whitespace-nowrap">
                  {selectedProducts.size} {t('products_selected')}
                </span>
                <button onClick={() => { if (showToast()) return; onSetBulkAction('stock'); }}
                  className={`flex-1 sm:flex-none px-3 py-2.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all ${selectedProducts.size === 0 ? 'bg-white/[0.02] text-white/20 border-white/[0.05] cursor-not-allowed' : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15'}`}>
                  {t('change_stock')}
                </button>
                <button onClick={() => { if (showToast()) return; onSetBulkAction('category'); }}
                  className={`flex-1 sm:flex-none px-3 py-2.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all ${selectedProducts.size === 0 ? 'bg-white/[0.02] text-white/20 border-white/[0.05] cursor-not-allowed' : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/15'}`}>
                  {t('product_category')}
                </button>
                <button onClick={() => { onSetBulkMode(false); onSetBulkAction(null); }}
                  className="w-10 h-10 rounded-xl bg-white/[0.04] text-white/30 border border-white/[0.07] hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-all">
                  <X size={13} />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => onSetBulkMode(true)}
                  className="flex-1 sm:flex-none w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-2.5 flex items-center justify-center sm:gap-1.5 rounded-xl bg-white/[0.03] text-white/40 border border-white/[0.07] hover:bg-white/[0.07] hover:text-white/70 hover:border-white/15 transition-all text-xs font-semibold tracking-wide uppercase whitespace-nowrap">
                  <Filter size={13} /> <span className="hidden sm:inline">{t('bulk_operation')}</span>
                </button>
                <button onClick={onOpenCategoryModal}
                  className="flex-1 sm:flex-none w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-2.5 flex items-center justify-center sm:gap-1.5 rounded-xl bg-white/[0.03] text-white/40 border border-white/[0.07] hover:bg-white/[0.07] hover:text-white/70 hover:border-white/15 transition-all text-xs font-semibold tracking-wide uppercase whitespace-nowrap">
                  <FolderPlus size={13} /> <span className="hidden sm:inline">{t('add_category')}</span>
                </button>
                <button onClick={onConfirmDeleteAll} disabled={products.length === 0 || updating}
                  className="flex-1 sm:flex-none w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-2.5 flex items-center justify-center sm:gap-1.5 rounded-xl border border-red-500/15 bg-red-500/[0.04] text-red-400/60 text-xs font-semibold tracking-wide uppercase whitespace-nowrap hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30 transition-all disabled:opacity-25">
                  <Trash2 size={13} /> <span className="hidden sm:inline">{t('delete_all')}</span>
                </button>
              </>
            )}

            {!isBulkMode && <div className="w-px h-5 bg-white/[0.08] hidden sm:block" />}

            {!isBulkMode && (
              <button onClick={onOpenAddModal}
                className="flex-1 sm:flex-none flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-black text-xs font-bold tracking-wide uppercase whitespace-nowrap transition-all hover:brightness-110 active:scale-95 shadow-lg shadow-[#D4AF37]/10"
                style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)' }}>
                <Plus size={14} /> <span className="hidden sm:inline">{t('new_product')}</span><span className="sm:hidden">{t('new_product')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Product table — DESKTOP (lg+) */}
      <div className="space-y-6 hidden lg:block">
        {products.length === 0 ? (
          <div className="text-center py-32 bg-card border border-dashed border-white/10 rounded-lg">
            <AlertCircle className="mx-auto text-white/5 mb-4" size={48} />
            <p className="text-white/20 uppercase tracking-[0.3em] text-xs">{t('product_not_found')}</p>
          </div>
        ) : Object.entries(groupedProducts).map(([catId, { name, products: catProducts }]) => (
          <div key={catId} className="bg-white/[0.04] border border-white/[0.10] rounded-2xl overflow-hidden backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
            <div className="w-full px-8 py-5 flex items-center justify-between bg-white/[0.05] hover:bg-white/[0.07] transition-colors border-b border-white/[0.08]">
              <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => onToggleCategory(catId)}>
                <div className="w-10 h-10 rounded-xl bg-white/5 text-white/70 flex items-center justify-center shrink-0">
                  <Tag size={17} />
                </div>
                <div>
                  <h3 className="text-lg font-serif font-bold text-white cursor-help"
                    title={(() => { const cat = categories.find(c => c.id === catId); return cat && cat.name !== name ? cat.name : undefined; })()}>
                    {name}
                  </h3>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">{catProducts.length} {t('products_count')}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {catId !== 'unassigned' && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); const cat = categories.find(c => c.id === catId); if (cat) onEditCategory(cat); }}
                      className="p-2 rounded-lg hover:bg-white/5 text-white/20 hover:text-white/60 transition-transform duration-200" title={t('edit_category')}>
                      <Edit3 size={15} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteCategory(catId, name); }}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-transform duration-200" title={t('delete_category')}>
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
                <div onClick={() => onToggleCategory(catId)} className="cursor-pointer p-2">
                  {expandedCategories.includes(catId) ? <ChevronDown size={20} className="text-white/20" /> : <ChevronRight size={20} className="text-white/20" />}
                </div>
              </div>
            </div>

            <AnimatePresence>
              {expandedCategories.includes(catId) && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          <th className="px-4 py-3 w-8">
                            {isBulkMode && (
                              <input type="checkbox"
                                checked={products.filter(p => p.category_id === catId).every(p => selectedProducts.has(p.id))}
                                onChange={() => onSelectAllProducts(catId)}
                                className="w-4 h-4 accent-yellow-500 cursor-pointer" />
                            )}
                          </th>
                          <th className="px-6 py-3 min-w-[280px] text-[9px] uppercase tracking-[0.3em] text-white/25 font-semibold">{t('product_name_label')}</th>
                          <th className="px-6 py-3 min-w-[110px] text-[9px] uppercase tracking-[0.3em] text-white/25 font-semibold">{t('price_label')}</th>
                          <th className="px-6 py-3 min-w-[90px] text-[9px] uppercase tracking-[0.3em] text-white/25 font-semibold">{t('views_label')}</th>
                          <th className="px-6 py-3 min-w-[150px] text-[9px] uppercase tracking-[0.3em] text-white/25 font-semibold">{t('stock_label')}</th>
                          <th className="px-6 py-3 text-[9px] uppercase tracking-[0.3em] text-white/25 font-semibold text-right">{t('operations_label')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catProducts.map((product) => {
                          const variants = (product as any).variants as Array<{ variant_type: string | null; parent_variant_id: string | null }> | undefined;

                          return (
                            <React.Fragment key={product.id}>
                              {/* Main Product Row */}
                              <tr className={`group transition-transform duration-200 border-b border-white/[0.06] hover:bg-white/[0.05] ${selectedProducts.has(product.id) ? 'bg-white/[0.03]' : ''}`}>
                                <td className="px-4 py-4 w-8">
                                  {isBulkMode && (
                                    <input type="checkbox" checked={selectedProducts.has(product.id)} onChange={() => onToggleProductSelection(product.id)} className="w-4 h-4 accent-yellow-500 cursor-pointer" />
                                  )}
                                </td>
                                <td className="px-6 py-3.5 min-w-[280px] max-w-[340px]">
                                  <div className="flex items-center gap-3.5">
                                    <div className="w-11 h-11 bg-white/[0.03] border border-white/[0.08] overflow-hidden relative rounded-xl group-hover:border-white/25 transition-transform duration-300 shrink-0">
                                      <img src={product.image_url} alt={getProductName(product)} loading="eager" decoding="async" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                    </div>
                                    <div className="flex min-w-0 flex-col">
                                      <span className="max-w-[220px] truncate font-semibold text-[14px] text-white group-hover:text-white transition-colors"
                                        title={language !== 'az' ? product.name : undefined}>
                                        {getProductName(product)}
                                      </span>
                                      <div className="flex items-center gap-1.5 mt-0.5 min-h-3 flex-wrap">
                                        {product.is_special && <span className="flex items-center gap-1 text-[11px] text-white/60 uppercase tracking-[0.12em] font-bold"><Sparkles size={10} /> {t('chef_special')}</span>}
                                        {product.is_spicy && <span className="flex items-center gap-1 text-[11px] text-red-400/80 uppercase tracking-[0.12em] font-bold"><Zap size={10} /> {t('spicy_label')}</span>}
                                        {(() => {
                                          if (!variants?.length) return null;
                                          const sizes = variants.filter(v => !v.parent_variant_id).length;
                                          if (!sizes) return null;
                                          return <span className="text-[13px] text-white/45 tracking-wide font-medium">{sizes} {t('variant_type_tab').toLowerCase()}</span>;
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="flex flex-col">
                                    {product.discount_price ? (
                                      <>
                                        <span className="font-black text-[15px] tracking-wide text-white/70">₼{product.discount_price}</span>
                                        <span className="text-[10px] text-white/20 line-through">₼{product.price}</span>
                                      </>
                                    ) : (
                                      <span className="font-black text-[15px] tracking-wide text-white/70">₼{product.price}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5 min-w-[90px]">
                                  <span className="text-white/60 text-sm font-semibold tabular-nums group-hover:text-white/80 transition-colors">{product.views_count || 0}</span>
                                </td>
                                <td className="px-6 py-3.5 min-w-[150px]">
                                  <button onClick={() => onToggleStock(product)} title={product.is_in_stock ? t('not_in_stock') : t('in_stock')}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider whitespace-nowrap transition-transform duration-200 border ${product.is_in_stock ? 'bg-white/[0.04] text-white/60 border-white/[0.10] hover:border-red-500/25 hover:text-red-400/70' : 'bg-white/[0.03] text-white/30 border-white/[0.07] hover:border-green-500/20 hover:text-white/50'}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${product.is_in_stock ? 'bg-green-400' : 'bg-white/20'}`} />
                                    {product.is_in_stock ? t('in_stock') : t('not_in_stock')}
                                  </button>
                                </td>
                                <td className="px-6 py-3.5 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button onClick={() => onEditProduct(product)} className="p-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.12] hover:border-white/30 text-white/50 hover:text-white/80 transition-transform duration-200 hover:scale-105 active:scale-95">
                                      <Edit3 size={14} />
                                    </button>
                                    <button onClick={() => onDeleteProduct(product.id, product.name)} className="p-2 rounded-xl bg-white/[0.07] hover:bg-red-500/10 border border-white/[0.12] hover:border-red-500/25 text-white/50 hover:text-red-400 transition-transform duration-200 hover:scale-105 active:scale-95">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>

                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Product cards — MOBILE/TABLET (< lg) */}
      <div className="lg:hidden pb-24 px-4">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <AlertCircle size={28} className="text-white/10" />
            </div>
            <p className="text-white/20 uppercase tracking-[0.3em] text-xs">{t('product_not_found')}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(groupedProducts).map(([catId, { name, products: catProducts }]) => {
              const isExpanded = expandedCategories.includes(catId);
              return (
                <motion.div key={catId} layout className="rounded-2xl overflow-hidden border border-white/[0.07] shadow-sm"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>

                  {/* Category Header */}
                  <div
                    role="button"
                    className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer"
                    onClick={() => onToggleCategory(catId)}
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)' }}>
                      <Tag size={14} className="text-gold/70" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[13px] font-serif font-bold text-white leading-tight truncate">{name}</p>
                      <p className="text-[9px] text-white/30 uppercase tracking-widest mt-0.5">{catProducts.length} {t('products_count')}</p>
                    </div>
                    {catId !== 'unassigned' && (
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { const cat = categories.find(c => c.id === catId); if (cat) onEditCategory(cat); }}
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all">
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => onDeleteCategory(catId, name)}
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-500/[0.08] transition-all">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="shrink-0 w-10 h-10 flex items-center justify-center">
                      <ChevronDown size={17} className="text-white/25" />
                    </motion.div>
                  </div>

                  {/* Products */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="items"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                        className="overflow-hidden">
                        <div className="border-t border-white/[0.05] divide-y divide-white/[0.04]">
                          {catProducts.map((product, idx) => {
                            const variants = (product as any).variants as Array<{ variant_type: string | null; parent_variant_id: string | null }> | undefined;
                            const sizeCount = variants?.filter(v => !v.parent_variant_id).length ?? 0;
                            return (
                              <motion.div
                                key={product.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.04 }}
                                className={`relative px-4 py-3.5 transition-colors ${selectedProducts.has(product.id) ? 'bg-gold/[0.04]' : ''}`}>

                                <div className="flex gap-3 items-start">
                                  {/* Checkbox (bulk) */}
                                  {isBulkMode && (
                                    <div className="pt-1 shrink-0">
                                      <input type="checkbox"
                                        checked={selectedProducts.has(product.id)}
                                        onChange={() => onToggleProductSelection(product.id)}
                                        className="w-4 h-4 accent-yellow-500 cursor-pointer" />
                                    </div>
                                  )}

                                  {/* Image */}
                                  <div className="w-[72px] h-[72px] rounded-2xl bg-white/[0.04] border border-white/[0.07] overflow-hidden shrink-0">
                                    {product.image_url
                                      ? <img src={product.image_url} alt={getProductName(product)} loading="eager" decoding="async" className="w-full h-full object-cover" />
                                      : <div className="w-full h-full flex items-center justify-center">
                                          <Tag size={20} className="text-white/10" />
                                        </div>
                                    }
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    {/* Name row */}
                                    <div className="flex items-start justify-between gap-1.5">
                                      <p className="text-[14px] font-semibold text-white leading-snug line-clamp-2 flex-1">
                                        {getProductName(product)}
                                      </p>
                                      {/* Price */}
                                      <div className="shrink-0 text-right">
                                        {product.discount_price ? (
                                          <>
                                            <p className="text-[15px] font-black text-gold leading-none">₼{product.discount_price}</p>
                                            <p className="text-[10px] text-white/20 line-through">₼{product.price}</p>
                                          </>
                                        ) : (
                                          <p className="text-[15px] font-black text-gold leading-none">₼{product.price}</p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Badges */}
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                      {product.is_special && (
                                        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-bold border"
                                          style={{ background: 'rgba(212,175,55,0.07)', borderColor: 'rgba(212,175,55,0.2)', color: 'rgba(212,175,55,0.8)' }}>
                                          <Sparkles size={7} /> {t('chef_special')}
                                        </span>
                                      )}
                                      {product.is_spicy && (
                                        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-bold border border-red-500/20 bg-red-500/[0.07] text-red-400/80">
                                          <Zap size={7} /> {t('spicy_label')}
                                        </span>
                                      )}
                                      {sizeCount > 0 && (
                                        <span className="text-[9px] text-white/30 uppercase tracking-wider">{sizeCount} {t('variant_type_tab').toLowerCase()}</span>
                                      )}
                                    </div>

                                    {/* Bottom row: stock + actions */}
                                    <div className="flex items-center justify-between mt-2.5">
                                      <button
                                        onClick={() => onToggleStock(product)}
                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] uppercase font-bold tracking-wider border transition-all ${
                                          product.is_in_stock
                                            ? 'bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-400/80'
                                            : 'bg-white/[0.03] border-white/[0.08] text-white/25'
                                        }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${product.is_in_stock ? 'bg-emerald-400' : 'bg-white/20'}`} />
                                        {product.is_in_stock ? t('in_stock') : t('not_in_stock')}
                                      </button>

                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] text-white/20 tabular-nums">{product.views_count || 0} {t('views_label')}</span>
                                        <div className="w-px h-3 bg-white/[0.08]" />
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setSheetProduct(product); }}
                                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/[0.10] text-white/40 hover:text-white/80 hover:bg-white/[0.10] active:scale-95 transition-all">
                                          <MoreVertical size={15} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom Sheet (mobile action menu) ── */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {sheetProduct && (
            <BottomSheet
              product={sheetProduct}
              onClose={() => setSheetProduct(null)}
              onEdit={() => { setSheetProduct(null); onEditProduct(sheetProduct); }}
              onToggleStock={() => { onToggleStock(sheetProduct); setSheetProduct(null); }}
              onDelete={() => { setSheetProduct(null); onDeleteProduct(sheetProduct.id, sheetProduct.name); }}
              getProductName={getProductName}
              language={language}
              t={t}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
