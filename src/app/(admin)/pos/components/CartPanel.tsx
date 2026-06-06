'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Trash2, ShoppingBag, Send, Save } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
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
  const { lightMode } = useTheme();

  if (!cart) {
    return (
      <div className={`flex flex-col items-center justify-center h-full py-12 ${lightMode ? 'text-gray-300' : 'text-white/15'}`}>
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
      <div className={`flex items-center justify-between flex-shrink-0 pb-3 border-b ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
        <div>
          <p className={`text-lg font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Masa {cart.table_number}</p>
          <p className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>{cart.items.length} məhsul · {cart.guest_count} nəfər</p>
        </div>
        {!isEmpty && (
          <button onClick={onClear} className={`text-[10px] uppercase tracking-wider font-semibold transition-all ${lightMode ? 'text-gray-400 hover:text-gray-600' : 'text-white/20 hover:text-white/50'}`}>
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
              className={`flex flex-col items-center justify-center h-full ${lightMode ? 'text-gray-300' : 'text-white/15'}`}
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
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${lightMode ? 'bg-white border-gray-200 shadow-sm' : 'bg-[#141414] border-white/[0.06]'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${lightMode ? 'text-gray-700' : 'text-white/80'}`}>{item.product_name}</p>
                  {item.modifiers.length > 0 && (
                    <p className={`text-[10px] truncate ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>
                      {item.modifiers.map(m => m.label).join(', ')}
                    </p>
                  )}
                  <p className="text-xs font-bold text-gold mt-0.5">{(item.unit_price * item.quantity).toFixed(2)} ₼</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div className={`flex items-center rounded-lg overflow-hidden ${lightMode ? 'bg-gray-100 border border-gray-200' : 'bg-white/[0.04] border border-white/[0.07]'}`}>
                    <button onClick={() => onUpdateQty(idx, -1)} className={`w-8 h-8 flex items-center justify-center active:scale-90 transition-all ${lightMode ? 'text-gray-400 hover:text-gray-600' : 'text-white/40 hover:text-white'}`}>
                      <Minus size={13} />
                    </button>
                    <span className={`text-xs w-5 text-center font-black tabular-nums ${lightMode ? 'text-gray-800' : 'text-white'}`}>{item.quantity}</span>
                    <button onClick={() => onUpdateQty(idx, 1)} className="w-8 h-8 flex items-center justify-center text-gold active:scale-90 transition-all">
                      <Plus size={13} />
                    </button>
                  </div>
                  <button onClick={() => onRemove(idx)} className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all ${lightMode ? 'text-gray-300 hover:text-red-500 hover:bg-red-50' : 'text-white/20 hover:text-red-400 hover:bg-red-500/10'}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className={`flex-shrink-0 pt-3 border-t space-y-2.5 ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
        <div className="flex items-center justify-between px-1">
          <span className={`text-xs uppercase tracking-widest font-semibold ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{t('total_label')}</span>
          <span className="text-xl font-black tracking-tight tabular-nums text-gold">{total.toFixed(2)} ₼</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${lightMode ? 'border border-gray-200 text-gray-500 hover:bg-gray-100' : 'border border-white/10 text-white/40 hover:bg-white/5'}`}>
            Geri
          </button>
          <button onClick={onSaveDraft} disabled={isEmpty} className={`py-3 px-4 rounded-xl border disabled:opacity-30 transition-all ${lightMode ? 'border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300' : 'border-white/10 text-white/30 hover:text-white/60 hover:border-white/20'}`}>
            <Save size={16} />
          </button>
          <button
            onClick={onPlaceOrder}
            disabled={isEmpty || submitting}
            className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-25"
            style={!isEmpty && !submitting ? { background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', color: '#000', boxShadow: '0 4px 20px rgba(212,175,55,0.3)' } : lightMode ? { background: '#f3f4f6', color: '#9ca3af' } : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}
          >
            {submitting ? 'Göndərilir...' : <><Send size={15} /> Sifariş</>}
          </button>
        </div>
      </div>
    </div>
  );
}
