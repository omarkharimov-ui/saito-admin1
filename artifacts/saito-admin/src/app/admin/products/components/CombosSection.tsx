'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit3, Trash2, PackagePlus, Loader2, ShoppingBag, AlertCircle, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { EmptyState } from '@/components/ui/primitives';
import ComboModal from '../../combos/components/ComboModal';
import type { Combo, Product } from '@/types';

const COMBO_CACHE_KEY = 'saito_combos_cache';
const PRODUCT_CACHE_KEY = 'saito_combos_products_cache';

function readCache<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeCache<T>(key: string, val: T) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* noop */ }
}

export default function CombosSection() {
  const { t, language } = useLanguage();
  const [combos, setCombos] = useState<Combo[]>(() => readCache<Combo[]>(COMBO_CACHE_KEY) || []);
  const [products, setProducts] = useState<Product[]>(() => readCache<Product[]>(PRODUCT_CACHE_KEY) || []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Combo | null>(null);
  const [fetching, setFetching] = useState(combos.length === 0);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/combos');
      if (!res.ok) throw new Error('API xətası');
      const data = await res.json();
      const newCombos = data.combos || [];
      const newProducts = data.products || [];
      setCombos(newCombos);
      setProducts(newProducts);
      writeCache(COMBO_CACHE_KEY, newCombos);
      writeCache(PRODUCT_CACHE_KEY, newProducts);
    } catch {
      toast.error(t('error_loading'), { id: 'action-toast' });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setEditingCombo(null); setModalOpen(true); };
  const openEdit = (combo: Combo) => { setEditingCombo(combo); setModalOpen(true); };

  const handleDelete = async (combo: Combo) => {
    setDeletingId(combo.id);
    try {
      const res = await fetch(`/api/combos?id=${combo.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('API error');
      toast.success(t('combo_deleted'), { id: 'action-toast' });
      setCombos(prev => prev.filter(c => c.id !== combo.id));
    } catch { toast.error(t('error_deleting'), { id: 'action-toast' }); }
    finally { setDeletingId(null); setConfirmDelete(null); }
  };

  const toggleStock = async (combo: Combo) => {
    const updated = { is_in_stock: !combo.is_in_stock };
    setCombos(prev => prev.map(c => c.id === combo.id ? { ...c, ...updated } : c));
    try {
      const res = await fetch('/api/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: combo.id, data: updated })
      });
      if (!res.ok) throw new Error('API error');
      const name = (combo as any)[`name_${language}`] || combo.name;
      toast.dismiss();
      toast.success(updated.is_in_stock ? `"${name}" məhsul stokdadır` : `"${name}" məhsul stokda yoxdur`, { id: `combo-${combo.id}`, duration: 2000 });
    } catch {
      setCombos(prev => prev.map(c => c.id === combo.id ? { ...c, is_in_stock: combo.is_in_stock } : c));
      toast.error(t('error'), { id: `combo-err-${combo.id}` });
    }
  };

  const toggleActive = async (combo: Combo) => {
    const originalState = combo.is_active;
    const updated = { is_active: !combo.is_active };
    setCombos(prev => prev.map(c => c.id === combo.id ? { ...c, ...updated } : c));
    try {
      const res = await fetch('/api/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: combo.id, data: updated })
      });
      if (!res.ok) throw new Error('API error');
      const name = (combo as any)[`name_${language}`] || combo.name;
      toast.dismiss();
      toast.success(updated.is_active ? `"${name}" aktiv edildi` : `"${name}" deaktiv edildi`, { id: `combo-${combo.id}`, duration: 2000 });
    } catch {
      setCombos(prev => prev.map(c => c.id === combo.id ? { ...c, is_active: originalState } : c));
      toast.error(t('error'), { id: `combo-err-${combo.id}` });
    }
  };

  const enrichedCombos = combos.map(combo => ({
    ...combo,
    items: (combo.items || []).map(item => ({
      ...item,
      product: products.find(p => p.id === item.product_id),
    })),
  }));

  if (fetching && combos.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl overflow-hidden animate-pulse">
            <div className="h-36 bg-[var(--theme-surface-soft)]" />
            <div className="p-4 space-y-3">
              <div className="flex justify-between">
                <div className="h-4 w-28 bg-[var(--theme-surface-soft)] rounded-lg" />
                <div className="h-5 w-12 bg-[var(--theme-surface-soft)] rounded-lg" />
              </div>
              <div className="h-3 w-full bg-[var(--theme-surface-soft)] rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--theme-text-secondary)]">
          {combos.length} combo
        </p>
        <button onClick={openNew}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)] font-bold text-[11px] uppercase tracking-widest hover:brightness-95 transition-all shadow-lg shadow-black/25">
          <Plus size={15} />
          {t('combo_new')}
        </button>
      </div>

      {enrichedCombos.length === 0 ? (
        <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-[32px] p-16 text-center">
          <EmptyState
            icon={<PackagePlus size={20} />}
            title={t('combo_empty')}
            description={t('combo_empty_hint')}
            action={
              <button onClick={openNew}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--theme-surface-soft)] hover:bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] text-[12px] font-semibold transition-all">
                <Plus size={14} />
                {t('combo_new')}
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {enrichedCombos.map((combo) => {
            const separateTotal = (combo.items || []).reduce((sum, it) => {
              return sum + ((it.product?.price || 0) * it.quantity);
            }, 0);
            const saving = separateTotal - combo.price;

            return (
              <div key={combo.id}
                onClick={() => openEdit(combo)}
                className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl overflow-hidden hover:border-[var(--theme-border-strong)] transition-all group cursor-pointer active:scale-[0.98]"
              >
                  <div className="relative h-36 bg-[var(--theme-surface-soft)]">
                    {combo.image_url ? (
                      <img src={combo.image_url} alt={(combo as any)[`name_${language}`] || combo.name} loading="eager" decoding="async" fetchPriority="high" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PackagePlus size={32} className="text-[var(--theme-border)]" />
                      </div>
                    )}
                    <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                      {!combo.is_active && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] text-[10px] font-bold uppercase tracking-wider border border-[var(--theme-border)]">
                          {t('combo_inactive')}
                        </span>
                      )}
                    </div>
                    <div className="absolute top-2.5 right-2.5 flex gap-1.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(combo); }}
                        className="w-8 h-8 rounded-xl bg-[var(--theme-surface)]/60 backdrop-blur-sm border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors">
                        <Edit3 size={13} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(combo); }}
                        className="w-8 h-8 rounded-xl bg-black/60 backdrop-blur-sm border border-red-500/20 flex items-center justify-center text-red-400/60 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-[var(--theme-text)] text-[15px] leading-snug">{(combo as any)[`name_${language}`] || combo.name}</h3>
                      <div className="text-right flex-shrink-0">
                        <p className="text-gold font-black text-[16px]">₼{combo.price.toFixed(2)}</p>
                        {saving > 0 && separateTotal > 0 && (
                          <p className="text-[10px] text-[var(--theme-text-muted)] line-through">₼{separateTotal.toFixed(2)}</p>
                        )}
                      </div>
                    </div>

                    {((combo as any)[`description_${language}`] || combo.description) && (
                      <p className="text-[12px] text-[var(--theme-text-secondary)] mb-3 line-clamp-2">{(combo as any)[`description_${language}`] || combo.description}</p>
                    )}

                    {(combo.items || []).length > 0 && (
                      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                        {(combo.items || []).slice(0, 4).map(item => (
                          <div key={item.product_id} className="flex items-center gap-1 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-lg px-2 py-1">
                            {item.product?.image_url && (
                              <img src={item.product.image_url} alt="" loading="lazy" decoding="async" className="w-4 h-4 rounded object-cover" />
                            )}
                            <span className="text-[11px] text-[var(--theme-text-secondary)] truncate max-w-[80px]">{item.product?.name}</span>
                            {item.quantity > 1 && <span className="text-[10px] text-[var(--theme-text-muted)]">×{item.quantity}</span>}
                          </div>
                        ))}
                        {(combo.items || []).length > 4 && (
                          <span className="text-[11px] text-[var(--theme-text-muted)]">+{(combo.items || []).length - 4}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-3 border-t border-[var(--theme-border)]">
                      <button onClick={(e) => { e.stopPropagation(); toggleActive(combo); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${combo.is_active ? 'bg-green-500/[0.07] text-green-400/90 border-green-500/20 hover:border-green-500/35' : 'bg-white/[0.03] text-[var(--theme-text-muted)] border-[var(--theme-border)] hover:border-[var(--theme-border-strong)]'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${combo.is_active ? 'bg-green-400' : 'bg-[var(--theme-text-muted)]'}`} />
                        {combo.is_active ? t('combo_active') : t('combo_inactive')}
                      </button>

                      <div className="ml-auto flex items-center gap-1 text-[11px] text-[var(--theme-text-muted)]">
                        <ShoppingBag size={11} />
                        {(combo.items || []).length} {t('combo_col_items').toLowerCase()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-full sm:max-w-sm bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <AlertCircle size={20} className="text-red-400" />
                </div>
                <h3 className="text-[var(--theme-text)] font-semibold">{t('combo_delete')}</h3>
              </div>
              <p className="text-[var(--theme-text-muted)] text-sm mb-6">{t('combo_confirm_delete')}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] text-sm font-semibold transition-all border border-[var(--theme-border)]">
                  {t('cancel')}
                </button>
                <button onClick={() => handleDelete(confirmDelete)} disabled={!!deletingId}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white text-sm font-bold transition-all flex items-center justify-center gap-2">
                  {deletingId === confirmDelete.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {t('delete')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ComboModal
        open={modalOpen}
        editingCombo={editingCombo}
        products={products}
        onClose={() => setModalOpen(false)}
        onSaved={fetchData}
      />
    </div>
  );
}
