'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Split, Check, Plus, Minus, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';

interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  modifiers: any;
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
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const updateQty = (id: string, delta: number, max: number) => {
    setSelectedItems(prev => {
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

  const selectedCount = Object.values(selectedItems).reduce((s, q) => s + q, 0);
  const selectedTotal = useMemo(() => {
    return Object.entries(selectedItems).reduce((sum, [id, qty]) => {
      const item = items.find(i => i.id === id);
      return sum + (item?.unit_price || 0) * qty;
    }, 0);
  }, [selectedItems, items]);

  const handleSplit = async () => {
    if (selectedCount === 0) return;
    setLoading(true);
    try {
      const itemsToSplit = Object.entries(selectedItems).map(([id, qty]) => {
        const item = items.find(i => i.id === id);
        return {
          ...item,
          quantity: qty
        };
      });

      const res = await fetch('/api/orders/bill-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_order_id: orderId,
          items_to_split: itemsToSplit
        })
      });

      if (!res.ok) throw new Error('Hesabı bölmək mümkün olmadı');
      
      toast.success('Hesab uğurla bölündü');
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="fixed inset-0 z-[160] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-[#111] border border-white/10 rounded-[2.5rem] w-full max-w-xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col pointer-events-auto">
              {/* Header */}
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <Split size={20} className="text-blue-400" />
                    <h2 className="text-2xl font-black tracking-tight">Hesabı Böl</h2>
                  </div>
                  <p className="text-xs text-white/30 font-bold uppercase tracking-widest">Yeni hesaba keçəcək məhsulları seçin</p>
                </div>
                <button onClick={onClose} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"><X size={20} /></button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {items.map(item => {
                  const selQty = selectedItems[item.id] || 0;
                  return (
                    <div key={item.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${selQty > 0 ? 'bg-blue-500/5 border-blue-500/30' : 'bg-white/[0.02] border-white/5'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white/80 truncate">{item.product_name}</p>
                        <p className="text-xs text-white/30 font-black mt-1">{item.unit_price.toFixed(2)} ₼</p>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="flex items-center bg-black/40 rounded-xl p-1 border border-white/5">
                            <button onClick={() => updateQty(item.id, -1, item.quantity)} className="w-8 h-8 rounded-lg hover:bg-white/5 text-white/40 flex items-center justify-center transition-all"><Minus size={14} /></button>
                            <span className="w-8 text-center text-sm font-black tabular-nums">{selQty} <span className="text-[10px] text-white/20">/ {item.quantity}</span></span>
                            <button onClick={() => updateQty(item.id, 1, item.quantity)} className="w-8 h-8 rounded-lg hover:bg-white/5 text-blue-400 flex items-center justify-center transition-all"><Plus size={14} /></button>
                         </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="p-8 border-t border-white/5 bg-black/20 space-y-4">
                 <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Seçilmiş Cəmi</p>
                        <p className="text-2xl font-black text-blue-400 tabular-nums">{selectedTotal.toFixed(2)} ₼</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Məhsul Sayı</p>
                        <p className="text-lg font-black text-white/80">{selectedCount} ədəd</p>
                    </div>
                 </div>
                 <button 
                  disabled={loading || selectedCount === 0} 
                  onClick={handleSplit}
                  className="w-full py-5 rounded-2xl bg-blue-500 hover:bg-blue-600 disabled:opacity-30 disabled:grayscale text-white font-black uppercase tracking-[0.2em] text-sm shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-3"
                 >
                   {loading ? <Loader2 size={18} className="animate-spin" /> : <Split size={18} />}
                   {loading ? 'Bölünür...' : 'Hesabı Böl və Yeni Sifariş Yarat'}
                 </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
