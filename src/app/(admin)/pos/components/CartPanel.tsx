'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Trash2, ShoppingBag, Send, Save } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { PosCart } from '../types';

interface CartPanelProps {
  cart: PosCart | null;
  onUpdateQty: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onPlaceOrder: () => void;
  onSaveDraft: () => void;
  onClear: () => void;
  onBack: () => void;
  submitting: boolean;
}

export function CartPanel({
  cart, onUpdateQty, onRemove, onPlaceOrder, onSaveDraft,
  onClear, onBack, submitting,
}: CartPanelProps) {
  const { t } = useLanguage();

  if (!cart) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/15 py-12">
        <ShoppingBag size={40} className="mb-3 opacity-30" />
        <p className="text-sm">Masa seçilməyib</p>
      </div>
    );
  }

  const total = cart.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const isEmpty = cart.items.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 pb-3 border-b border-white/[0.06]">
        <div>
          <p className="text-lg font-bold text-white">Masa {cart.table_number}</p>
          <p className="text-xs text-white/40">{cart.items.length} məhsul · {cart.guest_count} nəfər</p>
        </div>
        {!isEmpty && (
          <button onClick={onClear} className="text-[10px] uppercase tracking-wider text-white/20 hover:text-white/50 font-semibold transition-all">
            Təmizlə
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto py-3 space-y-1.5">
        <AnimatePresence initial={false}>
          {isEmpty ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-white/15"
            >
              <p className="text-sm font-medium">Məhsul əlavə edin</p>
            </motion.div>
          ) : (
            cart.items.map((item, idx) => (
              <motion.div
                key={`${item.product_id}__${idx}`}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, height: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2.5 bg-[#141414] rounded-xl px-3 py-2.5 border border-white/[0.06]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/80 truncate">{item.product_name}</p>
                  {item.modifiers.length > 0 && (
                    <p className="text-[10px] text-white/30 truncate">
                      {item.modifiers.map(m => m.label).join(', ')}
                    </p>
                  )}
                  <p className="text-xs font-bold text-gold mt-0.5">{(item.unit_price * item.quantity).toFixed(2)} ₼</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div className="flex items-center bg-white/[0.04] border border-white/[0.07] rounded-lg overflow-hidden">
                    <button onClick={() => onUpdateQty(idx, -1)} className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white active:scale-90 transition-all">
                      <Minus size={13} />
                    </button>
                    <span className="text-white text-xs w-5 text-center font-black tabular-nums">{item.quantity}</span>
                    <button onClick={() => onUpdateQty(idx, 1)} className="w-8 h-8 flex items-center justify-center text-gold active:scale-90 transition-all">
                      <Plus size={13} />
                    </button>
                  </div>
                  <button onClick={() => onRemove(idx)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 active:scale-90 transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 pt-3 border-t border-white/[0.06] space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-white/30 uppercase tracking-widest font-semibold">{t('total_label')}</span>
          <span className="text-xl font-black tracking-tight tabular-nums text-gold">{total.toFixed(2)} ₼</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="flex-1 py-3 rounded-xl border border-white/10 text-white/40 text-sm font-semibold hover:bg-white/5 transition-all">
            Geri
          </button>
          <button onClick={onSaveDraft} disabled={isEmpty} className="py-3 px-4 rounded-xl border border-white/10 text-white/30 hover:text-white/60 hover:border-white/20 disabled:opacity-30 transition-all">
            <Save size={16} />
          </button>
          <button
            onClick={onPlaceOrder}
            disabled={isEmpty || submitting}
            className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-25"
            style={!isEmpty && !submitting ? { background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', color: '#000', boxShadow: '0 4px 20px rgba(212,175,55,0.3)' } : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}
          >
            {submitting ? 'Göndərilir...' : <><Send size={15} /> Sifariş</>}
          </button>
        </div>
      </div>
    </div>
  );
}
