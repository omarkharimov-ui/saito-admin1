'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, CreditCard, Banknote, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import ReceiptPreview from './ReceiptPreview';
import type { Order, OrderItem } from '../types';

interface ReceiptModalProps {
  order: Order;
  onClose: () => void;
  getProductName: (item: OrderItem) => string;
  onPay?: (paymentMethod?: string, tipAmount?: number) => Promise<void>;
}

interface RestaurantInfo {
  name: string;
  address: string;
  receipt_title: string;
  receipt_currency: string;
  receipt_service_fee_pct: number;
  receipt_show_service_fee: boolean;
  receipt_footer_text: string;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function ReceiptModal({ order, onClose, getProductName, onPay }: ReceiptModalProps) {
  const [mounted, setMounted] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('card');
  const [tipAmount, setTipAmount] = useState(0);

  const handlePayAndClose = async () => {
    if (!onPay) return;
    setPaying(true);
    try {
      await onPay(paymentMethod, tipAmount);
    } finally {
      setPaying(false);
      onClose();
    }
  };
  const [restaurant, setRestaurant] = useState<RestaurantInfo>({
    name: '',
    address: '',
    receipt_title: '',
    receipt_currency: '₼',
    receipt_service_fee_pct: 10,
    receipt_show_service_fee: true,
    receipt_footer_text: '',
  });
  const [restaurantLoaded, setRestaurantLoaded] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    supabase.from('settings').select('restaurant_name, address, receipt_title, receipt_currency, receipt_service_fee_pct, receipt_show_service_fee, receipt_footer_text').single().then(({ data }) => {
      if (data) {
        setRestaurant(prev => ({
          ...prev,
          name: (data.restaurant_name as string | null) || prev.name,
          address: (data.address as string | null) || prev.address,
          receipt_title: (data.receipt_title as string | null) || prev.receipt_title,
          receipt_currency: (data.receipt_currency as string | null) || prev.receipt_currency,
          receipt_service_fee_pct: data.receipt_service_fee_pct ?? prev.receipt_service_fee_pct,
          receipt_show_service_fee: data.receipt_show_service_fee ?? prev.receipt_show_service_fee,
          receipt_footer_text: (data.receipt_footer_text as string | null) ?? prev.receipt_footer_text,
        }));
      }
      setRestaurantLoaded(true);
    });
  }, []);

  const items = order.order_items ?? [];
  const subtotal = items.reduce((sum, i) => sum + i.total_price, 0);
  const serviceFee = restaurant.receipt_show_service_fee ? subtotal * (restaurant.receipt_service_fee_pct / 100) : 0;
  const total = subtotal + serviceFee + tipAmount;

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=400,height=700');
    if (!win) return;

    const itemsHtml = items.map((item) => {
      const name = getProductName(item);
      return `<div style="display:flex;font-size:11px;margin-bottom:3px;align-items:flex-start">
        <span style="flex:1;padding-right:4px;line-height:1.4">${name}</span>
        <span style="width:44px;text-align:center">${item.quantity}</span>
        <span style="width:56px;text-align:right;font-weight:600">${item.total_price.toFixed(2)}</span>
      </div>`;
    }).join('');

    const serviceFeeHtml = restaurant.receipt_show_service_fee
      ? `<div style="display:flex;font-size:11px;margin-bottom:4px">
          <span style="flex:1">Servis haqqı (${restaurant.receipt_service_fee_pct}%)</span>
          <span style="width:56px;text-align:right">${serviceFee.toFixed(2)}</span>
        </div>`
      : '';

    const tipHtml = tipAmount > 0
      ? `<div style="display:flex;font-size:11px;margin-bottom:4px">
          <span style="flex:1">Çaypulu</span>
          <span style="width:56px;text-align:right">${tipAmount.toFixed(2)}</span>
        </div>`
      : '';

    const footerHtml = restaurant.receipt_footer_text
      ? `<div style="text-align:center;font-size:10px;color:#555;line-height:1.5;margin-top:8px">${restaurant.receipt_footer_text}</div>`
      : '';

    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Sifaris Ceki #${order.table_number ?? '-'}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Courier New',Courier,monospace; background:#fff; color:#000; font-size:12px; }
      </style>
    </head><body>
      <div style="width:302px;margin:0 auto;padding:20px 14px;line-height:1.5">
        <div style="text-align:center;font-weight:700;font-size:14px;margin-bottom:2px">${restaurant.name}</div>
        <hr style="border:none;border-top:1px dashed #000;margin:6px 0"/>
        <div style="font-size:11px;margin-bottom:2px">Masa: <strong>${order.table_number ?? '-'}</strong></div>
        <div style="font-size:11px;margin-bottom:6px">${formatDate(new Date().toISOString())}&nbsp;&nbsp;&nbsp;${formatTime(new Date().toISOString())}</div>
        <hr style="border:none;border-top:1px dashed #000;margin:6px 0"/>
        <div style="display:flex;font-size:11px;font-weight:700;margin-bottom:4px">
          <span style="flex:1">Məhsul</span>
          <span style="width:44px;text-align:center">Miqdar</span>
          <span style="width:56px;text-align:right">Qiymət</span>
        </div>
        <hr style="border:none;border-top:1px dashed #000;margin:4px 0 6px"/>
        ${itemsHtml}
        <hr style="border:none;border-top:1px dashed #000;margin:8px 0"/>
        ${serviceFeeHtml}
        ${tipHtml}
        <div style="display:flex;justify-content:space-between;font-size:20px">
          <b>YEKUN:</b>
          <b>${total.toFixed(2)}&nbsp;${restaurant.receipt_currency}</b>
        </div>
        ${footerHtml}
      </div>
    </body></html>`;

    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 350);
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center md:p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 32 }}
          transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          className="relative z-10 w-full md:w-auto flex flex-col items-center gap-3 bg-[#0a0a0a] md:bg-transparent rounded-t-3xl md:rounded-none p-4 md:p-0"
          onClick={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          style={{ touchAction: 'pan-y' }}
        >
          {/* Action buttons */}
          <div className="w-full md:w-auto flex items-center gap-2">
            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all flex-shrink-0">
              <X size={18} />
            </button>
            <button onClick={handlePrint} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-black text-white border border-white/20 hover:bg-white hover:text-black text-sm font-bold tracking-widest uppercase transition-all duration-200">
              <Printer size={15} /> Çap et
            </button>
            {onPay && (
              <button onClick={handlePayAndClose} disabled={paying}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-bold tracking-widest uppercase transition-all duration-200 disabled:opacity-50">
                {paying ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} Bağla
              </button>
            )}
          </div>

          {/* Payment method toggler */}
          {onPay && (
            <div className="w-full md:w-auto flex items-center gap-1.5 p-1 bg-white/[0.04] border border-white/[0.08] rounded-xl">
              <button onClick={() => setPaymentMethod('card')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold tracking-widest uppercase transition-all duration-200 ${paymentMethod === 'card' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'text-white/30 hover:text-white/50'}`}>
                <CreditCard size={14} /> Kart
              </button>
              <button onClick={() => setPaymentMethod('cash')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold tracking-widest uppercase transition-all duration-200 ${paymentMethod === 'cash' ? 'bg-amber-500/20 text-amber-400 shadow-sm' : 'text-white/30 hover:text-white/50'}`}>
                <Banknote size={14} /> Nağd
              </button>
            </div>
          )}

          {/* Tip input */}
          {onPay && (
            <div className="w-full md:w-auto flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5">
              <span className="text-xs text-white/40 font-medium">Çaypulu</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setTipAmount(Math.max(0, tipAmount - 1))}
                  className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 text-sm font-bold hover:bg-white/10 transition-all">−</button>
                <span className="w-14 text-center text-sm font-bold text-white tabular-nums">{tipAmount} ₼</span>
                <button onClick={() => setTipAmount(tipAmount + 1)}
                  className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 text-sm font-bold hover:bg-white/10 transition-all">+</button>
              </div>
            </div>
          )}

          {/* Receipt paper */}
          <div id="receipt-print-area" className="w-full md:w-auto overflow-x-auto">
            {!restaurantLoaded ? (
              <div className="bg-white text-black shadow-2xl" style={{ width: '100%', maxWidth: 302, padding: '40px 0', textAlign: 'center', fontSize: 12, color: '#999' }}>Yüklənir...</div>
            ) : (
              <ReceiptPreview
                title={restaurant.name}
                tableNumber={order.table_number ?? '-'}
                items={items.map(item => ({
                  product_name: getProductName(item),
                  quantity: item.quantity,
                  total_price: item.total_price,
                }))}
                showServiceFee={restaurant.receipt_show_service_fee}
                serviceFeePct={restaurant.receipt_service_fee_pct}
                currency={restaurant.receipt_currency}
                footerText={restaurant.receipt_footer_text}
                width={302}
              />
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
