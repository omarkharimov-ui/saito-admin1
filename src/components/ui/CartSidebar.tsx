'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Trash2, ShoppingBag, ChevronRight, TableProperties } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useUI } from '@/context/UIContext';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

const CartSidebar = () => {
  const { items, removeItem, updateQty, clearCart, totalPrice, totalCount, isCartOpen, setIsCartOpen } = useCart();
  const { tableNumber } = useUI();
  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // TODO: restore QR guard: if (!tableNumber && isCartOpen) { setIsCartOpen(false); return null; }

  const handleSubmitOrder = async () => {
    setSubmitting(true);
    try {
      const tableNum = tableNumber ? parseInt(tableNumber) : null;

      // Check for an existing active order on this table
      let existingOrder: { id: string; total_amount: number } | null = null;
      if (tableNum) {
        const { data: activeOrders } = await supabase
          .from('orders')
          .select('id, total_amount')
          .eq('table_number', tableNum)
          .in('status', ['new', 'confirmed'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (activeOrders && activeOrders.length > 0) {
          existingOrder = activeOrders[0];
        }
      }

      const newItems = items.map(item => ({
          product_id: item.product.id,
          variant_id: item.variant?.id || null,
          product_name: (() => { const az = item.product.translations?.['az']?.name || item.product.name; return item.variant ? `${az} (${item.variant.name})` : az; })(),
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.unitPrice * item.quantity,
          kitchen_status: 'hot',  // Database default ilə eyni
          image_url: item.product.image_url || null,
          name: item.product.name,
          hasImageUrl: 'image_url' in item.product,
          productKeys: Object.keys(item.product)
        }));

      if (existingOrder) {

        // Fetch existing order_items to merge quantities while preserving prepared_quantity
        const { data: existingItems, error: fetchErr } = await supabase
          .from('order_items')
          .select('id, product_id, variant_id, quantity, prepared_quantity, unit_price, kitchen_status')
          .eq('order_id', existingOrder.id);
        if (fetchErr) throw fetchErr;

        for (const item of newItems) {
          const match = existingItems?.find(
            (ei: any) =>
              ei.product_id === item.product_id &&
              (ei.variant_id || null) === (item.variant_id || null)
          );

          if (match) {
            // Increase orderedQuantity, KEEP preparedQuantity unchanged.
            // kitchen_status flips to 'pending' so the order reopens for kitchen.
            const newQty = (match.quantity || 0) + item.quantity;
            const newTotal = (match.unit_price || item.unit_price) * newQty;
            const { error: updErr } = await supabase
              .from('order_items')
              .update({
                quantity: newQty,
                total_price: newTotal,
                kitchen_status: 'pending',
              })
              .eq('id', match.id);
            if (updErr) throw updErr;
            console.log(`✏️  Mövcud item yeniləndi: ${item.product_name} qty ${match.quantity} → ${newQty} (prepared qalır: ${match.prepared_quantity ?? 0})`);
          } else {
            // Brand new product on this order: insert with prepared_quantity = 0
            const { error: insErr } = await supabase.from('order_items').insert({
              ...item,
              order_id: existingOrder.id,
              kitchen_status: 'pending',
              prepared_quantity: 0,
              created_at: new Date().toISOString(),
            });
            if (insErr) throw insErr;
          }
        }

        const newTotal = (existingOrder.total_amount || 0) + totalPrice;
        const { error: updateError, data: updateData } = await supabase
          .from('orders')
          .update({
            total_amount: newTotal,
            status: 'new',
            kitchen_status: 'hot',
            ...(customerNote.trim() ? { customer_note: customerNote.trim() } : {}),
          })
          .eq('id', existingOrder.id)
          .select();
        if (updateError) throw updateError;
      } else {
        // Create new order
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_note: customerNote.trim() || null,
            table_number: tableNum,
            total_amount: totalPrice,
            status: 'new',
            kitchen_status: 'hot',
            items: [],
          })
          .select()
          .single();
        if (orderError) throw orderError;

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(newItems.map(i => ({ 
            ...i, 
            order_id: order.id
            // kitchen_status artıq newItems-də var
          })));
        if (itemsError) {
          console.error('❌ Insert items error:', itemsError);
          console.dir(itemsError);
          throw itemsError;
        }
      }

      clearCart();
      setCustomerNote('');
      setStep('success');
    } catch (e: any) {
      console.error('Order error full:', e);
      alert('Xəta: ' + (e?.message || e?.details || e?.hint || JSON.stringify(e)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsCartOpen(false);
    setTimeout(() => setStep('cart'), 400);
  };

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
            onClick={handleClose}
          />
          {/* Mobile: bottom sheet, Desktop: right sidebar */}
          <motion.div
            initial={{ y: '100%', x: 0 }}
            animate={{ y: 0, x: 0 }}
            exit={{ y: '100%', x: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 max-h-[90vh] md:bottom-auto md:top-0 md:left-auto md:right-0 md:h-full md:max-h-full md:w-96 bg-[#0a0a0a] border-t md:border-t-0 md:border-l border-white/10 z-[70] flex flex-col rounded-t-2xl md:rounded-none"
          >
            {/* Handle bar (mobile only) */}
            <div className="flex justify-center pt-3 pb-1 md:hidden">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <ShoppingBag size={18} className="text-gold" />
                <span className="font-bold tracking-widest uppercase text-sm">Səbət</span>
                {totalCount > 0 && (
                  <span className="bg-gold text-black text-[10px] font-black px-2 py-0.5 rounded-full">{totalCount}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {tableNumber && (
                  <div className="flex items-center gap-1.5 text-[10px] text-gold border border-gold/30 px-2.5 py-1 rounded-full">
                    <TableProperties size={10} />
                    Masa {tableNumber}
                  </div>
                )}
                <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors p-1">
                  <X size={18} />
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {step === 'cart' && (
                <motion.div key="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col flex-1 overflow-hidden">
                  {items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/20 py-12">
                      <ShoppingBag size={40} />
                      <p className="text-sm">Səbət boşdur</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
                        {items.map((item) => {
                          const key = item.variant ? item.variant.id : item.product.id;
                          return (
                            <div key={key} className="flex gap-3 items-center bg-white/[0.03] rounded-xl px-3 py-3">
                              {item.product.image_url && (
                                <div className="w-14 h-14 relative rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                                  <Image src={item.product.image_url} alt={item.product.name} fill className="object-cover" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{item.product.name}</p>
                                {item.variant && <p className="text-[11px] text-white/40">{item.variant.name}</p>}
                                <p className="text-gold text-sm font-bold">{(item.unitPrice * item.quantity).toFixed(2)} ₼</p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform">
                                  <Minus size={11} />
                                </button>
                                <span className="text-sm w-5 text-center font-medium">{item.quantity}</span>
                                <button onClick={() => updateQty(item.id, item.quantity + 1)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform">
                                  <Plus size={11} />
                                </button>
                                <button onClick={() => removeItem(item.id)} className="w-7 h-7 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center active:scale-95 transition-transform ml-1">
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="px-5 py-4 border-t border-white/10 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-white/40 text-sm">Cəmi</span>
                          <span className="text-gold font-bold text-xl">{totalPrice.toFixed(2)} ₼</span>
                        </div>
                        <button
                          onClick={() => setStep('checkout')}
                          className="w-full bg-gold text-black font-bold py-4 tracking-widest uppercase text-sm flex items-center justify-center gap-2 hover:bg-white transition-colors rounded-xl active:scale-[0.98]"
                        >
                          Sifariş ver <ChevronRight size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {step === 'checkout' && (
                <motion.div key="checkout" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <button onClick={() => setStep('cart')} className="text-white/40 hover:text-white text-xs uppercase tracking-widest flex items-center gap-1 transition-colors">
                      ← Geri
                    </button>
                    <div>
                      <h3 className="text-white font-bold text-lg">Sifarişi Tamamla</h3>
                      <p className="text-gold/70 text-xs mt-0.5">Masa {tableNumber} üçün sifariş</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-2">Xüsusi qeyd (opsional)</label>
                      <textarea
                        value={customerNote}
                        onChange={e => setCustomerNote(e.target.value)}
                        placeholder="Allergiya, xüsusi istək..."
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 focus:border-gold outline-none px-4 py-3 text-sm text-white placeholder:text-white/20 rounded-xl transition-colors resize-none"
                      />
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 space-y-2">
                      {items.map(item => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-white/60 truncate mr-2">{item.product.name}{item.variant && ` (${item.variant.name})`} <span className="text-white/30">×{item.quantity}</span></span>
                          <span className="text-white flex-shrink-0">{(item.unitPrice * item.quantity).toFixed(2)} ₼</span>
                        </div>
                      ))}
                      <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
                        <span className="text-white/40 text-sm">Cəmi</span>
                        <span className="text-gold">{totalPrice.toFixed(2)} ₼</span>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-4 border-t border-white/10">
                    <button
                      onClick={handleSubmitOrder}
                      disabled={submitting}
                      className="w-full bg-gold text-black font-bold py-4 tracking-widest uppercase text-sm flex items-center justify-center gap-2 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded-xl active:scale-[0.98]"
                    >
                      {submitting ? 'Göndərilir...' : 'Sifarişi Göndər'}
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 'success' && (
                <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center py-8">
                  <div>
                    <h3 className="text-white font-bold text-xl mb-2">Sifariş Alındı!</h3>
                    <p className="text-white/40 text-sm">Sifarişiniz qəbul edildi. Tezliklə hazırlanacaq.</p>
                    {tableNumber && (
                      <p className="text-gold text-sm mt-1">Masa {tableNumber}-ə çatdırılacaq</p>
                    )}
                  </div>
                  <button
                    onClick={handleClose}
                    className="px-8 py-3 border border-gold/30 text-gold text-sm uppercase tracking-widest transition-colors rounded-xl"
                  >
                    Bağla
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CartSidebar;
