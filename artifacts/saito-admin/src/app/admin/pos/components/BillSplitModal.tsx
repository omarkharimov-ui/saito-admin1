'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Split, Check, Plus, Minus, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import { appleCard, appleBackdrop, fastExit } from '@/lib/modal-transitions';

interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  modifiers: any;
  combo_group_id?: string;
  special_notes?: string;
}

interface BillSplitModalProps {
  open: boolean;
  orderId: string;
  items: OrderItem[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BillSplitModal({ open, orderId, items, onClose, onSuccess }: BillSplitModalProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [selectedComboIds, setSelectedComboIds] = useState<Set<string>>(new Set());
  const [selectedStandalone, setSelectedStandalone] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  // Group items: combos by combo_group_id, standalone as-is
  const { comboGroups, standaloneItems } = useMemo(() => {
    const groups = new Map<string, { comboGroupId: string; name: string; children: OrderItem[] }>();
    const standalone: OrderItem[] = [];
    for (const item of items) {
      const cg = item.combo_group_id;
      if (cg) {
        if (!groups.has(cg)) {
          const notes = item.special_notes || '';
          const name = notes.startsWith('Kombo: ') ? notes.slice(7) : notes || 'Kombo';
          groups.set(cg, { comboGroupId: cg, name, children: [] });
        }
        groups.get(cg)!.children.push(item);
      } else {
        standalone.push(item);
      }
    }
    return { comboGroups: Array.from(groups.values()), standaloneItems: standalone };
  }, [items]);

  const toggleCombo = (comboGroupId: string) => {
    setSelectedComboIds(prev => {
      const n = new Set(prev);
      if (n.has(comboGroupId)) n.delete(comboGroupId); else n.add(comboGroupId);
      return n;
    });
  };

  const updateStandalone = (id: string, delta: number, max: number) => {
    setSelectedStandalone(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, Math.min(max, current + delta));
      if (next === 0) {
        const n = { ...prev };
        delete n[id];
        return n;
      }
      return { ...prev, [id]: next };
    });
  };

  const selectedCount = useMemo(() => {
    let count = 0;
    for (const group of comboGroups) {
      if (selectedComboIds.has(group.comboGroupId)) count += group.children.reduce((s, c) => s + c.quantity, 0);
    }
    count += Object.values(selectedStandalone).reduce((s, q) => s + q, 0);
    return count;
  }, [selectedComboIds, selectedStandalone, comboGroups]);

  const selectedTotal = useMemo(() => {
    let total = 0;
    for (const group of comboGroups) {
      if (selectedComboIds.has(group.comboGroupId)) {
        total += group.children.reduce((s, c) => s + c.total_price, 0);
      }
    }
    for (const [id, qty] of Object.entries(selectedStandalone)) {
      const item = items.find(i => i.id === id);
      total += (item?.unit_price || 0) * qty;
    }
    return total;
  }, [selectedComboIds, selectedStandalone, comboGroups, items]);

  const handleSplit = async () => {
    if (selectedCount === 0) return;
    setLoading(true);
    try {
      const itemsToSplit: any[] = [];

      // Add all children from selected combos
      for (const group of comboGroups) {
        if (selectedComboIds.has(group.comboGroupId)) {
          for (const child of group.children) {
            itemsToSplit.push({ ...child });
          }
        }
      }

      // Add selected standalone items
      for (const [id, qty] of Object.entries(selectedStandalone)) {
        const item = items.find(i => i.id === id);
        if (item) itemsToSplit.push({ ...item, quantity: qty });
      }

      const res = await apiFetch('/api/orders/bill-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_order_id: orderId,
          items_to_split: itemsToSplit
        })
      });

      if (!res.ok) throw new Error(t('bill_split_error'));
      
      toast.success(t('bill_split_success'));
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0, y: '100%' }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: '100%' }} transition={fastExit} className="fixed inset-0 z-[150] bg-black/60" onClick={onClose} />
          <motion.div {...appleCard} transition={fastExit} className="fixed inset-0 z-[160] flex items-center justify-center p-4 pointer-events-none">
            <div className={`border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'} rounded-6xl w-full max-w-xl max-h-[85vh] overflow-hidden shadow-elevated flex flex-col pointer-events-auto`}>
              {/* Header */}
              <div className={`p-8 border-b ${lightMode ? 'border-zinc-100' : 'border-white/5'} flex items-center justify-between`}>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <Split size={20} className="text-blue-500" />
                    <h2 className={`text-2xl font-black tracking-tight ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{t('split_bill')}</h2>
                  </div>
                  <p className={`text-xs font-bold uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('select_items_to_move')}</p>
                </div>
                <button onClick={onClose} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}`}><X size={20} /></button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {/* Combo groups */}
                {comboGroups.map(group => {
                  const isSelected = selectedComboIds.has(group.comboGroupId);
                  return (
                    <div key={group.comboGroupId} className={`rounded-2xl border transition-all ${isSelected ? (lightMode ? 'bg-blue-50 border-blue-300' : 'bg-blue-500/5 border-blue-500/30') : (lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/5')}`}>
                      <button onClick={() => toggleCombo(group.comboGroupId)} className="w-full flex items-center justify-between p-4">
                        <div className="flex-1 min-w-0 text-left">
                          <p className={`text-sm font-bold truncate ${lightMode ? 'text-zinc-800' : 'text-white/80'}`}>{group.name}</p>
                          <p className={`text-xs mt-1 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                            {group.children.map(c => c.product_name).join(', ')}
                          </p>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${isSelected ? 'bg-blue-500 border-blue-500' : (lightMode ? 'border-zinc-300' : 'border-white/30')}`}>
                          {isSelected && <Check size={14} className="text-white" />}
                        </div>
                      </button>
                    </div>
                  );
                })}
                {/* Standalone items */}
                {standaloneItems.map(item => {
                  const selQty = selectedStandalone[item.id] || 0;
                  return (
                    <div key={item.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${selQty > 0 ? (lightMode ? 'bg-blue-50 border-blue-300' : 'bg-blue-500/5 border-blue-500/30') : (lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/5')}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${lightMode ? 'text-zinc-800' : 'text-white/80'}`}>{item.product_name}</p>
                        <p className={`text-xs font-black mt-1 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{item.unit_price.toFixed(2)} ₼</p>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className={`flex items-center rounded-xl p-1 border ${lightMode ? 'bg-zinc-100 border-zinc-200' : 'bg-black/40 border-white/5'}`}>
                            <button onClick={() => updateStandalone(item.id, -1, item.quantity)} className={`w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-all ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}><Minus size={14} /></button>
                            <span className={`w-8 text-center text-sm font-black tabular-nums ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{selQty} <span className={`text-xs ${lightMode ? 'text-zinc-400' : 'text-white/20'}`}>/ {item.quantity}</span></span>
                            <button onClick={() => updateStandalone(item.id, 1, item.quantity)} className="w-8 h-8 rounded-lg hover:bg-blue-500/10 text-blue-500 flex items-center justify-center transition-all"><Plus size={14} /></button>
                         </div>
                      </div>
                    </div>
                  );
                })}
                {comboGroups.length === 0 && standaloneItems.length === 0 && (
                  <div className={`text-center py-8 text-sm ${lightMode ? 'text-zinc-400' : 'text-white/20'}`}>{t('product_not_found')}</div>
                )}
              </div>

              {/* Footer */}
              <div className={`p-8 border-t space-y-4 ${lightMode ? 'border-zinc-100 bg-zinc-50' : 'border-white/5 bg-black/20'}`}>
                 <div className="flex items-center justify-between">
                    <div>
                        <p className={`text-xs font-black uppercase tracking-widest mb-1 ${lightMode ? 'text-zinc-400' : 'text-white/20'}`}>{t('selected_total')}</p>
                        <p className="text-2xl font-black text-blue-500 tabular-nums">{selectedTotal.toFixed(2)} ₼</p>
                    </div>
                    <div className="text-right">
                        <p className={`text-xs font-black uppercase tracking-widest mb-1 ${lightMode ? 'text-zinc-400' : 'text-white/20'}`}>{t('product_count')}</p>
                        <p className={`text-lg font-black ${lightMode ? 'text-zinc-900' : 'text-white/80'}`}>{selectedCount} t('pcs')</p>
                    </div>
                 </div>
                 <button 
                  disabled={loading || selectedCount === 0} 
                  onClick={handleSplit}
                  className="w-full py-5 rounded-2xl bg-blue-500 hover:bg-blue-600 disabled:opacity-30 disabled:grayscale text-white font-black uppercase tracking-[0.2em] text-sm shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-3"
                 >
                   {loading ? <Loader2 size={18} className="animate-spin" /> : <Split size={18} />}
                   {loading ? t('splitting') : t('split_and_create')}
                 </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
