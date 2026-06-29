'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { useToaster } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { MeshBroadcaster } from '@/lib/mesh/Broadcaster';
import { Clock, ChefHat, Utensils, AlertTriangle, BarChart2, Volume2, VolumeX, FlameKindling, SendHorizonal, LogOut, GitMerge } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { KitchenAIScheduler } from './components/KitchenAIScheduler';
import { az } from '@/lib/i18n/locales/az';
import { en } from '@/lib/i18n/locales/en';
import { ru } from '@/lib/i18n/locales/ru';

function KitchenToaster() {
  const { toasts, handlers } = useToaster({ duration: 3000 });
  const { startPause, endPause } = handlers;
  return (
    <div
      onMouseEnter={startPause}
      onMouseLeave={endPause}
      style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', pointerEvents: 'none' }}
    >
      <AnimatePresence>
        {toasts.filter(t => t.visible).map(t => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 80, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 340, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            drag="x"
            dragConstraints={{ left: 0, right: 340 }}
            dragElastic={0.08}
            onDragEnd={(_e, info) => { if (info.offset.x > 60 || info.velocity.x > 250) toast.dismiss(t.id); }}
            onClick={() => toast.dismiss(t.id)}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              minWidth: 200,
              maxWidth: 320,
              padding: '10px 14px',
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              userSelect: 'none',
              ...(typeof t.style === 'object' ? t.style : {}),
            }}
          >
            <span style={{ flex: 1 }}>
              {typeof t.message === 'function'
                ? (t.message as (t: any) => React.ReactNode)(t)
                : t.message as React.ReactNode}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  product_name: string;
  product_id?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string;
  kitchen_status?: 'pending' | 'ready';
  orderedQuantity: number;
  preparedQuantity: number;
  created_at?: string;
  is_on_hold?: boolean;
  course?: string;
}

interface Order {
  id: string;
  table_number: number;
  items: OrderItem[];
  total_amount: number;
  created_at: string;
  kitchen_status: string;
  kitchen_accepted_at?: string | null;
  kitchen_ready_at?: string | null;
  void_reason?: string | null;
  customer_note?: string;
  status: 'new' | 'confirmed' | 'paid' | 'cancelled' | string;
  is_rush?: boolean;
  is_draft?: boolean;
  merged_from_tables?: number[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const translations = { az, en, ru };

function timerBase(order: { created_at: string }): string {
  return order.created_at;
}

function formatTime(createdAt: string, t: any): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (diff < 1) return t.time_now || 'İndi';
  if (diff < 60) return `${diff} ${t.time_min || 'dəq'}`;
  return `${Math.floor(diff / 60)} ${t.time_hour || 'saat'}`;
}

function elapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function mapRawOrder(o: any, lang = 'az'): Order {
  const items: OrderItem[] = (o.order_items || []).map((i: any) => {
    const orderedQuantity = Number(i.quantity) || 0;
    const preparedQuantity = Number(i.prepared_quantity) || 0;
    const prod = Array.isArray(i.products) ? i.products[0] : i.products;
    const translations = prod?.translations as Record<string, {name?: string}> | null | undefined;
    const localName = translations?.[lang.toLowerCase()]?.name || translations?.['az']?.name || i.product_name;
    return {
      id: i.id,
      product_id: i.product_id,
      product_name: localName,
      quantity: orderedQuantity,
      unit_price: i.unit_price || 0,
      total_price: i.total_price,
      kitchen_status: (i.kitchen_status as 'pending' | 'ready') || 'pending',
      orderedQuantity,
      preparedQuantity,
      is_on_hold: false,
      course: 'main',
      image_url: i.image_url || prod?.image_url,
      created_at: i.created_at,
    };
  });

  return {
    id: o.id,
    table_number: o.table_number || 0,
    total_amount: o.total_amount || 0,
    created_at: o.created_at,
    kitchen_status: o.kitchen_status ?? '',
    kitchen_accepted_at: o.kitchen_accepted_at ?? null,
    kitchen_ready_at: o.kitchen_ready_at ?? null,
    void_reason: o.void_reason ?? null,
    customer_note: o.customer_note || '',
    status: o.status || 'new',
    is_rush: o.is_rush ?? false,
    merged_from_tables: [],
    items,
  };
}

// ─── CardWithCollapse — glassmorphism card with modal on click ────────
function CardWithCollapse({
  order, pendingItems, readyItems, allItemsReady, kitchenStatusLabel,
  isDelayed, stage, isNewlyAdded, isReadyTab,
  onAccept, onDeliver, onComplete, isAllItemsReady, formatTime, t, onSoldOut,
}: {
  order: Order;
  pendingItems: OrderItem[];
  readyItems: OrderItem[];
  allItemsReady: boolean;
  kitchenStatusLabel: { text: string; color: string; badge: string; pulse: boolean };
  isDelayed: boolean;
  stage: string;
  isNewlyAdded: (item: OrderItem, order: Order) => boolean;
  isReadyTab: boolean;
  onAccept: () => void;
  onDeliver: () => void;
  onComplete: () => void;
  isAllItemsReady: () => boolean;
  formatTime: (c: string) => string;
  t: any;
  onSoldOut: (productId: string, productName: string) => void;
}) {
  const [showReady, setShowReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [soldOutConfirm, setSoldOutConfirm] = useState<{id: string; name: string} | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = (item: OrderItem) => {
    if (!item.product_id) return;
    longPressTimer.current = setTimeout(() => setSoldOutConfirm({ id: item.product_id!, name: item.product_name }), 600);
  };
  const cancelLongPress = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

  const allItems = [...pendingItems, ...readyItems];

  const renderItem = (item: OrderItem, idx: number, list: OrderItem[], inModal = false, forceNormal = isReadyTab) => {
    const ready       = item.preparedQuantity;
    const pending     = Math.max(0, item.orderedQuantity - item.preparedQuantity);
    const isFullyReady = pending === 0 && item.orderedQuantity > 0;
    const hasSplit    = ready > 0 && pending > 0;
    const isGlowing   = isNewlyAdded(item, order);
    return (
      <div
        key={item.id}
        onMouseDown={() => startLongPress(item)}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={() => startLongPress(item)}
        onTouchEnd={cancelLongPress}
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl select-none transition-all ${
          isFullyReady && !forceNormal
            ? 'opacity-30'
            : isGlowing
              ? 'bg-[#D4AF37]/10 border border-[#D4AF37]/35 shadow-[0_0_12px_rgba(212,175,55,0.15)]'
              : ''
        } ${idx !== list.length - 1 ? 'border-b border-white/[0.06]' : ''}`}
      >
        <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/8 overflow-hidden flex-shrink-0">
          {item.image_url
            ? <img src={item.image_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px] font-black">{item.product_name.slice(0,2).toUpperCase()}</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          {hasSplit ? (
            <div className="flex items-center gap-2">
              <div className="w-0.5 self-stretch rounded-full bg-[#D4AF37]/60 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-tight truncate text-white tracking-wide">{item.product_name}</p>
                <p className="text-xs mt-0.5">
                  <span className="text-emerald-400 font-semibold">{ready}</span>
                  <span className="text-white/25 font-normal">/{item.orderedQuantity}</span>
                  <span className="text-white/30 font-normal ml-1 text-[10px]">hazır</span>
                  <span className="ml-1.5 text-[#c9a035] font-bold text-[10px] tracking-wide">+{pending} yeni</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isGlowing && <div className="w-0.5 self-stretch rounded-full bg-[#D4AF37]/60 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-bold text-sm leading-tight truncate tracking-wide ${
                    isFullyReady && !inModal && !forceNormal ? 'text-white/30' : item.is_on_hold ? 'text-white/40' : 'text-white'
                  }`}>{item.product_name}</p>
                  {item.is_on_hold && <span className="flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 tracking-wider">GÖZLƏT</span>}
                </div>
                <p className="text-xs mt-0.5">
                  <span className={`font-bold text-sm ${isFullyReady ? 'text-white/20' : 'text-white/60'}`}>×{item.orderedQuantity}</span>
                  {isGlowing && <span className="ml-1.5 text-[#c9a035] font-bold text-[10px] tracking-wide">· yeni</span>}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const allDone = isAllItemsReady();

  const accentColor = allDone
    ? 'rgba(16,185,129,0.5)'
    : isDelayed
      ? 'rgba(239,68,68,0.5)'
      : 'rgba(212,175,55,0.35)';

  const cardBg = allDone
    ? '#0b120e'
    : isDelayed
      ? '#120b0b'
      : '#0f0f0f';

  return (
    <>
    {/* ── Sold-out confirm ── */}
    {soldOutConfirm && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setSoldOutConfirm(null)}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative z-10 w-full max-w-full sm:max-w-xs rounded-2xl bg-[#151515] border border-red-500/30 shadow-2xl p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
          <p className="text-white font-bold text-sm text-center">«{soldOutConfirm.name}» tükəndi?</p>
          <p className="text-white/35 text-xs text-center">Müştərilərin menyusunda bu məhsul bağlanacaq</p>
          <div className="flex gap-2">
            <button onClick={() => setSoldOutConfirm(null)} className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/50 text-sm font-semibold hover:bg-white/[0.08] transition-all">Ləğv et</button>
            <button onClick={() => { onSoldOut(soldOutConfirm.id, soldOutConfirm.name); setSoldOutConfirm(null); }}
              className="flex-1 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-all">Tükəndi</button>
          </div>
        </div>
      </div>
    )}

    {/* ── Detail Modal ── */}
    {modalOpen && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setModalOpen(false)}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
        <div className="relative z-10 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.09)' }} onClick={e => e.stopPropagation()}>
          <div className="h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor.replace('0.5','0.9').replace('0.4','0.9').replace('0.35','0.9')}, transparent)` }} />
          <div className="px-6 pt-6 pb-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h2 className="text-4xl font-black tracking-tight" style={{ color: allDone ? '#10b981' : isDelayed ? '#f87171' : '#D4AF37' }}>
                  {t.kitchen_masa || 'MASA'} {(order.merged_from_tables||[]).length > 0 ? `${order.table_number}+${order.merged_from_tables!.join('+')}` : order.table_number}
                </h2>
                {order.is_rush && <span className="px-3 py-1 rounded-full text-xs font-black bg-orange-500/15 border border-orange-500/30 text-orange-400">{t.kitchen_rush||'TƏLƏSİR'}</span>}
              </div>
              <div className={`flex items-center gap-1.5 text-sm ${isDelayed ? 'text-red-400 font-semibold' : 'text-white/35'}`}>
                {isDelayed ? <AlertTriangle size={13}/> : <Clock size={13}/>}
                <span>{formatTime(timerBase(order))} əvvəl</span>
                {isDelayed && <span className="font-black">— {t.kitchen_overdue||'GECİKMƏ!'}</span>}
              </div>
            </div>
            <button onClick={() => setModalOpen(false)} className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/[0.1] text-white/50 hover:text-white transition-all text-lg">×</button>
          </div>
          <div className="h-px mx-6" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="px-4 py-3 space-y-0.5 max-h-[45vh] overflow-y-auto">
            {allItems.map((item, idx) => renderItem(item, idx, allItems, true))}
          </div>
          <div className="px-6 pt-3 pb-6">
            <div className="flex items-center justify-between mb-5">
              <span className="text-sm text-white/35 uppercase tracking-widest font-bold">{t.kitchen_total||'CƏMİ'}</span>
              <span className="text-3xl font-black text-[#D4AF37]">{order.total_amount.toFixed(2)} ₼</span>
            </div>
            {stage === 'accept' && (
              <button onClick={() => { onAccept(); setModalOpen(false); }}
                className="w-full rounded-2xl font-black flex items-center justify-center gap-3 transition-all active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg,#d4a825,#b8891e)', color:'#000', fontSize: 18, padding: '20px 0', letterSpacing: '0.02em', boxShadow:'0 4px 24px rgba(212,175,55,0.3)' }}>
                <FlameKindling size={22}/> {t.kitchen_accept||'Qəbul Et'}
              </button>
            )}
            {stage === 'deliver' && (
              <button onClick={() => { onDeliver(); setModalOpen(false); }}
                className="w-full rounded-2xl font-black flex items-center justify-center gap-3 transition-all active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg,#0f7a57,#0a5c41)', color:'#fff', border:'1px solid rgba(16,185,129,0.25)', fontSize: 18, padding: '20px 0', boxShadow:'0 4px 24px rgba(16,185,129,0.2)' }}>
                <SendHorizonal size={22}/> {t.kitchen_mark_ready||'Hazırdır — Servisə Ver'}
              </button>
            )}
          </div>
        </div>
      </div>
    )}

    {/* ── Card ── */}
    <div
      onClick={() => setModalOpen(true)}
      className="relative rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all duration-200 hover:scale-[1.015] active:scale-[0.99]"
      style={{ background: cardBg, border: `1px solid ${accentColor.replace('0.5','0.15').replace('0.4','0.12').replace('0.35','0.1')}` }}
    >
      {/* Top accent */}
      <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

      {/* Void banner */}
      {order.kitchen_status === 'cancelled' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-black/80 backdrop-blur-sm pointer-events-none">
          <p className="text-red-400 font-black text-base tracking-widest uppercase">Ləğv Edildi</p>
          {order.void_reason && <p className="text-white/40 text-xs mt-1 px-4 text-center">{order.void_reason}</p>}
        </div>
      )}

      {/* Header */}
      <div className="px-3 pt-3.5 pb-2.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <h2 className="text-xl font-black leading-none tracking-tight" style={{ color: allDone ? '#10b981' : isDelayed ? '#f87171' : '#D4AF37' }}>
                {t.kitchen_masa||'MASA'} {order.table_number}
              </h2>
              {(order.merged_from_tables||[]).length > 0 && (
                <div className="flex items-center gap-1">
                  <GitMerge size={10} className="text-amber-400/60" />
                  {order.merged_from_tables!.map(n => (
                    <span key={n} className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500/12 border border-amber-500/25 text-amber-300/80">+{n}</span>
                  ))}
                </div>
              )}
              {order.is_rush && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-orange-500/15 border border-orange-500/30 text-orange-400 tracking-widest">{t.kitchen_rush||'TƏLƏSİR'}</span>}
            </div>
            <div className={`flex items-center gap-1 text-[11px] ${isDelayed ? 'text-red-400/80 font-semibold' : 'text-white/30'}`}>
              {isDelayed ? <AlertTriangle size={10}/> : <Clock size={10}/>}
              <span>{formatTime(timerBase(order))} əvvəl</span>
              {isDelayed && <span className="font-black">— GECİKMƏ</span>}
            </div>
          </div>
          <span className={`flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-black border ${kitchenStatusLabel.color} ${kitchenStatusLabel.badge} ${kitchenStatusLabel.pulse ? 'animate-pulse' : ''}`}>
            {kitchenStatusLabel.text}
          </span>
        </div>
        {order.customer_note && (
          <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-500/[0.07] border border-amber-400/15">
            <p className="text-amber-300/80 text-[11px] leading-snug">{order.customer_note}</p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/[0.05]" />

      {/* Items */}
      <div className="px-2 py-2 flex-1 space-y-0.5">
        {pendingItems.slice(0, 5).map((item, idx) => renderItem(item, idx, pendingItems))}
        {pendingItems.length > 5 && (
          <p className="text-[10px] text-white/25 px-3 py-1 font-semibold">+{pendingItems.length - 5} {t.kitchen_more||'daha'}</p>
        )}
        {readyItems.length > 0 && !isReadyTab && (
          <div onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowReady(v => !v)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] font-semibold hover:bg-white/[0.04] transition-all mt-1">
              <span className="text-emerald-400/70">{readyItems.length} hazırdır</span>
              <span className="text-white/25">{showReady ? '▴' : '▾'}</span>
            </button>
            {showReady && <div className="space-y-0.5">{readyItems.map((item, idx) => renderItem(item, idx, readyItems))}</div>}
          </div>
        )}
        {isReadyTab && readyItems.length > 0 && (
          <div className="space-y-0.5">
            {readyItems.slice(0, 4).map((item, idx) => renderItem(item, idx, readyItems))}
            {readyItems.length > 4 && <p className="text-[10px] text-emerald-400/50 px-3 py-1">+{readyItems.length - 4} daha</p>}
          </div>
        )}
      </div>

      {/* Footer button */}
      {(stage === 'accept' || stage === 'deliver') && (
        <div className="px-3 pb-3 pt-1.5">
          <div className="h-px bg-white/[0.05] mb-2.5" />
          {stage === 'accept' && (
            <button onClick={e => { e.stopPropagation(); onAccept(); }}
              className="w-full rounded-xl font-black flex items-center justify-center gap-2 transition-all active:scale-[0.97] hover:brightness-110 select-none"
              style={{ background: 'linear-gradient(135deg,#d4a825,#b8891e)', color:'#000', boxShadow:'0 4px 16px rgba(212,175,55,0.25)', fontSize: 13, minHeight: 46, letterSpacing: '0.03em' }}>
              <FlameKindling size={16}/> {t.kitchen_accept||'Qəbul Et'}
            </button>
          )}
          {stage === 'deliver' && (
            <button onClick={e => { e.stopPropagation(); onDeliver(); }}
              className="w-full rounded-xl font-black flex items-center justify-center gap-2 transition-all active:scale-[0.97] hover:brightness-110 select-none"
              style={{ background: 'linear-gradient(135deg,#0f7a57,#0a5c41)', color:'#fff', boxShadow:'0 4px 16px rgba(16,185,129,0.18)', border:'1px solid rgba(16,185,129,0.3)', fontSize: 13, minHeight: 46, letterSpacing: '0.03em' }}>
              <SendHorizonal size={16}/> {t.kitchen_mark_ready||'Hazırdır — Servisə Ver'}
            </button>
          )}
        </div>
      )}
    </div>
    </>
  );
}

function playTone(freq: number, duration: number, vol = 0.4) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(); osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playNewOrderSound() { playTone(880, 0.15); setTimeout(() => playTone(1100, 0.2), 180); }
function playDelaySound()    { playTone(330, 0.4); setTimeout(() => playTone(280, 0.5), 450); }

// ─── Component ────────────────────────────────────────────────────────────────

export default function KitchenPage() {
  const { language, setLanguage } = useLanguage();
  const t = translations[language.toLowerCase() as keyof typeof translations] || az;

  const languages = [
    { code: 'az', label: 'AZ' },
    { code: 'en', label: 'EN' },
    { code: 'ru', label: 'RU' },
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  const [showWelcome, setShowWelcome] = useState(true);
  const [orders, setOrders]           = useState<Order[]>([]);
  const [activeTab, setActiveTab]     = useState<'active' | 'ready'>('active');
  const [soundOn, setSoundOn]         = useState(true);
  const [langLoading, setLangLoading] = useState(false);
  const [targetLang, setTargetLang] = useState<string>('az');
  const [recentAction, setRecentAction] = useState<{
    label: string;
    prevStatus: string;
    orderId: string;
    items: { id: string; prepared_quantity: number; kitchen_status: string }[];
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLang                      = useRef(language);
  const languageRef                   = useRef(language);
  const [, forceUpdate]               = useState(0);
  const [delayThreshold, setDelayThreshold] = useState(15);
  const prevOrderIds                  = useRef<Set<string>>(new Set());
  const delayAlerted                  = useRef<Set<string>>(new Set());
  const recentMergeRef                = useRef<{ key: string; time: number }>({ key: '', time: 0 });
  const soundOnRef                    = useRef(soundOn);
  soundOnRef.current = soundOn;

  // Newly added items: pending items whose created_at is newer than the order's created_at by >5 s
  // This identifies items added AFTER the original order was placed
  const isNewlyAdded = (item: OrderItem, order: Order): boolean => {
    if (order.kitchen_status === 'preparing' || order.kitchen_status === 'ready') return false;
    if (item.kitchen_status !== 'pending') return false;
    if (!item.created_at) return false;
    const itemMs  = new Date(item.created_at).getTime();
    const orderMs = new Date(order.created_at).getTime();
    return itemMs - orderMs > 5000;
  };

  // Load delay threshold from settings
  useEffect(() => {
    supabase.from('settings').select('order_delay_minutes').limit(1).then(({ data }) => {
      const val = Number(data?.[0]?.order_delay_minutes);
      if (!isNaN(val) && val >= 1) setDelayThreshold(val);
    });
  }, []);

  // Polling fallback (hər 30s) — realtime itirilərsə data təzə qalır
  useEffect(() => {
    const id = setInterval(() => fetchOrdersRef.current(), 30_000);
    return () => clearInterval(id);
  }, []);

  // 60-second tick — reduced frequency for CPU relief
  useEffect(() => {
    const id = setInterval(() => forceUpdate(x => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { languageRef.current = language; }, [language]);

  // ── Data mapping ───────────────────────────────────────────────────────────
  const prevItemCounts = useRef<Map<string, number>>(new Map());
  
  const applyData = useCallback((data: any[], lang: string) => {
    const mapped = data.map(o => mapRawOrder(o, lang)).filter((o: Order) => o.kitchen_status !== 'completed');

    // Enrich with merged_from_tables data
    const orderIds = mapped.map(o => o.id);
    if (orderIds.length > 0) {
      // Bulk query: find all child orders merged into any of our orders
      Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?select=id,table_number,merged_into&or=(${orderIds.map(id => `merged_into.eq.${id}`).join(',')})`, {
          headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}` }
        }).then(r => r.json()),
      ]).then(([childOrders]: any[]) => {
        const mergedMap = new Map<string, number[]>();
        (childOrders || []).forEach((co: any) => {
          if (co.merged_into && co.table_number) {
            const existing = mergedMap.get(co.merged_into) || [];
            if (!existing.includes(co.table_number)) existing.push(co.table_number);
            mergedMap.set(co.merged_into, existing);
          }
        });
        setOrders(prev => prev.map(o => ({
          ...o,
          merged_from_tables: mergedMap.get(o.id) || [],
        })));
      }).catch(() => {});
    }

    // Sound: new order arrived OR new items added to existing order
    if (soundOnRef.current) {
      const newIds = new Set(mapped.map((o: Order) => o.id));
      let shouldPlaySound = false;
      
      mapped.forEach((o: Order) => {
        // New order
        if (!prevOrderIds.current.has(o.id)) {
          shouldPlaySound = true;
        } else {
          // Existing order - check if items were added
          const prevCount = prevItemCounts.current.get(o.id) || 0;
          const currentCount = o.items.reduce((sum, item) => sum + item.orderedQuantity, 0);
          if (currentCount > prevCount) {
            shouldPlaySound = true;
          }
        }
        // Update item count tracking
        prevItemCounts.current.set(o.id, o.items.reduce((sum, item) => sum + item.orderedQuantity, 0));
      });
      
      if (shouldPlaySound) playNewOrderSound();
      prevOrderIds.current = newIds;
    }

    setOrders(mapped);
  }, []);

  // ── Helper: Get merged table display name (e.g., "9+7" if tables are merged)
  const getMergedTableName = useCallback(async (tableNum: number | null, orderId?: string): Promise<string> => {
    if (!tableNum) return 'Naməlum masa';
    if (!orderId) return `Masa ${tableNum}`;
    
    try {
      // Find orders that were merged INTO this order
      const { data } = await supabase
        .from('orders')
        .select('table_number')
        .eq('merged_into', orderId)
        .not('table_number', 'is', null);
      
      if (data && data.length > 0) {
        const mergedNums = data.map(o => o.table_number).filter(Boolean);
        if (mergedNums.length > 0) {
          return `Masa ${tableNum}+${mergedNums.join('+')}`;
        }
      }
      return `Masa ${tableNum}`;
    } catch {
      return `Masa ${tableNum}`;
    }
  }, []);

  // ── Fetch (fallback) ───────────────────────────────────────────────────────
  const fetchOrdersRef = useRef<() => Promise<void>>(async () => {});

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(
            *,
            products(image_url, translations)
          )
        `)
        .gt('table_number', 0)
        .not('status', 'eq', 'paid')
        .is('is_draft', 'false') // CRITICAL: hide draft/reservation placeholders from kitchen
        .order('created_at', { ascending: false });

      if (!error && data) {
        applyData(data, languageRef.current);
        // Cache for offline use
        localStorage.setItem('saito_kitchen_data', JSON.stringify(data));
      } else if (error) {
        throw error;
      }
    } catch (err) {
      console.warn('Kitchen fetch error, loading from cache:', err);
      const cached = localStorage.getItem('saito_kitchen_data');
      if (cached) {
        applyData(JSON.parse(cached), languageRef.current);
      }
    }
  }, [applyData]);

  // keep ref in sync — also assign immediately after creation
  fetchOrdersRef.current = fetchOrders;
  useEffect(() => { fetchOrdersRef.current = fetchOrders; }, [fetchOrders]);

  // ── Initial fetch — guaranteed with latest reference
  useEffect(() => { 
    fetchOrders(); 
    
    // Start listening for Mesh (Offline) orders
    MeshBroadcaster.startListening((rawOrder) => {
      const mapped = mapRawOrder({
        ...rawOrder,
        order_items: rawOrder.items.map((it: any) => ({
          ...it,
          prepared_quantity: 0,
          kitchen_status: 'pending'
        }))
      }, languageRef.current);
      
      setOrders(prev => {
        // Prevent duplicates
        if (prev.some(o => o.id === mapped.id)) return prev;
        return [mapped, ...prev];
      });
      
      if (soundOnRef.current) playNewOrderSound();
    });
  }, [fetchOrders]);

  // ── Supabase Realtime subscription — with debounce for CPU relief
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchOrdersRef.current(), 800);
    };
    
    const channel = createRealtimeChannel('kitchen_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload: any) => {
        debouncedFetch();
        
        // Detect table merge: when an order gets merged_into set
        const isMerge = payload.new?.merged_into && !payload.old?.merged_into;
        if (isMerge) {
          const targetTableNum = payload.new?.table_number;
          const targetOrderId = payload.new?.merged_into;
          const mergeKey = `${targetOrderId}-${targetTableNum}`;
          const now = Date.now();
          if (recentMergeRef.current.key === mergeKey && (now - recentMergeRef.current.time) < 2000) return;
          recentMergeRef.current = { key: mergeKey, time: now };
          const { data: targetOrder } = await supabase.from('orders').select('table_number').eq('id', targetOrderId).single();
          const targetTable = targetOrder?.table_number;
          toast.custom((_t) => (
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100 }}
              style={{ background: 'linear-gradient(135deg,#1a1200,#120e00)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: 18, padding: '14px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.08)', minWidth: 260, pointerEvents: 'auto' }}
              className="flex items-center gap-4"
            >
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <GitMerge size={20} color="#D4AF37" />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#D4AF37', lineHeight: 1.2 }}>
                  {targetTable ? `Masa ${targetTable}` : ''}{targetTable && targetTableNum ? <span style={{ color: 'rgba(212,175,55,0.5)' }}> + </span> : ''}{targetTableNum}
                </p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, fontWeight: 600 }}>Masalar birləşdirildi</p>
              </div>
            </motion.div>
          ), { duration: 5000, position: 'top-right' });
          if (soundOnRef.current) playNewOrderSound();
          return;
        }

        // Unmerge: merged_into was set, now cleared
        const isUnmerge = !payload.new?.merged_into && payload.old?.merged_into;
        if (isUnmerge) {
          const tableNum = payload.new?.table_number;
          toast.custom((_t) => (
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100 }}
              style={{ background: 'linear-gradient(135deg,#0d1218,#080e14)', border: '1px solid rgba(99,179,237,0.35)', borderRadius: 18, padding: '14px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 260, pointerEvents: 'auto' }}
              className="flex items-center gap-4"
            >
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(99,179,237,0.1)', border: '1px solid rgba(99,179,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 20 }}>Scissors</span>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#90cdf4', lineHeight: 1.2 }}>Masa {tableNum}</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontWeight: 600 }}>Ayrıldı — öz sifarişi var</p>
              </div>
            </motion.div>
          ), { duration: 4000, position: 'top-right' });
          return;
        }
        
        // Admin sifarişi dəyişdirdisə — yenilənmə bildirişi
        const isReset =
          !payload.new?.merged_into &&
          payload.new?.kitchen_status === 'pending' &&
          (payload.old?.kitchen_status !== 'pending' || payload.new?.total_amount !== payload.old?.total_amount);
        if (isReset) {
          const tableNum = payload.new?.table_number;
          const orderId = payload.new?.id;
          const tableName = await getMergedTableName(tableNum, orderId);
          toast.custom((_t) => (
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100 }}
              style={{ background: 'linear-gradient(135deg,#101a10,#080e08)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 18, padding: '14px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 260, pointerEvents: 'auto' }}
              className="flex items-center gap-4"
            >
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>⟳</div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#6ee7b7', lineHeight: 1.2 }}>{tableName}</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontWeight: 600 }}>Sifariş yeniləndi</p>
              </div>
            </motion.div>
          ), { duration: 4000, position: 'top-right' });
          if (soundOnRef.current) playNewOrderSound();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, async (payload: any) => {
        fetchOrdersRef.current();
        if (payload.eventType === 'INSERT' && soundOnRef.current) {
          setTimeout(() => playNewOrderSound(), 100);
          // Show new item toast
          const productName = payload.new?.product_name || '';
          const qty = payload.new?.quantity || 1;
          if (productName) {
            toast.custom((_t) => (
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100 }}
                style={{ background: 'linear-gradient(135deg,#1a1500,#110f00)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 18, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 240, pointerEvents: 'auto' }}
                className="flex items-center gap-3"
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>+</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', lineHeight: 1.2 }}>{qty}× {productName}</p>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, fontWeight: 600 }}>Yeni əlavə edildi</p>
                </div>
              </motion.div>
            ), { duration: 3500, position: 'top-right' });
          }
        }
      })
      .subscribe();

    return () => { 
      if (debounceTimer) clearTimeout(debounceTimer);
      removeRealtimeChannel(channel); 
    };
  }, [getMergedTableName]);

  useEffect(() => {
    if (prevLang.current === language) return;
    prevLang.current = language;
    setLangLoading(true);
    fetchOrdersRef.current();
    const timer = setTimeout(() => setLangLoading(false), 900);
    return () => clearTimeout(timer);
  }, [language]);

  // ── Delay warning sound (15 min) ───────────────────────────────────────────
  useEffect(() => {
    if (!soundOn) return;
    orders.forEach(order => {
      if (order.status === 'preparing' && order.kitchen_accepted_at && !delayAlerted.current.has(order.id)) {
        const mins = elapsedMinutes(timerBase(order));
        if (mins >= 15) {
          playDelaySound();
          delayAlerted.current.add(order.id);
        }
      }
    });
  }, [orders, soundOn]);

  // ── Undo helper ────────────────────────────────────────────────────────────
  const pushUndo = (label: string, order: Order) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setRecentAction({
      label,
      orderId: order.id,
      prevStatus: order.kitchen_status,
      items: order.items.map(it => ({
        id: it.id,
        prepared_quantity: it.preparedQuantity,
        kitchen_status: it.kitchen_status || 'pending',
      })),
    });
    undoTimer.current = setTimeout(() => setRecentAction(null), 8000);
  };

  const handleUndo = async () => {
    if (!recentAction) return;
    setRecentAction(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    await supabase.from('orders').update({ kitchen_status: recentAction.prevStatus, kitchen_ready_at: null }).eq('id', recentAction.orderId);
    for (const it of recentAction.items) {
      await supabase.from('order_items').update({ prepared_quantity: it.prepared_quantity, kitchen_status: it.kitchen_status }).eq('id', it.id);
    }
    fetchOrdersRef.current();
  };

  // ── DB actions ─────────────────────────────────────────────────────────────
  const updateOrderStatus = async (id: string, newStatus: 'preparing' | 'ready' | 'completed') => {
    if (newStatus === 'completed') {
      const order = orders.find(o => o.id === id);
      if (order) pushUndo(`MASA ${order.table_number} — tamamlandı`, order);
    }
    await supabase.from('orders').update({ kitchen_status: newStatus }).eq('id', id);
    fetchOrdersRef.current();
  };

  // Addım 2: Təhvil Ver — itemləri ready edir + stock deduction
  // Admin panel realtime subscription bu dəyişikliyi görür → masa flash edir
  const markAllReadyAndNotify = async (order: Order) => {
    pushUndo(`MASA ${order.table_number} — servise verildi`, order);
    for (const item of order.items) {
      if (item.preparedQuantity < item.orderedQuantity) {
        await supabase.from('order_items')
          .update({ prepared_quantity: item.orderedQuantity, kitchen_status: 'ready', served_quantity: item.orderedQuantity })
          .eq('id', item.id);
      }
    }
    await supabase.from('orders')
      .update({ kitchen_status: 'ready', kitchen_ready_at: new Date().toISOString() })
      .eq('id', order.id);

    // Deduct stock immediately when kitchen marks order as ready
    // Idempotency check prevents double-deduction if pay endpoint also runs
    try {
      await fetch('/api/orders/mark-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      });
    } catch (err) {
      console.error('[kitchen] mark-ready stock deduction failed:', err);
    }

    fetchOrdersRef.current();
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const { activeOrders, readyOrders } = useMemo(() => {
    // Aktiv: hər hansı item hələ hazır deyilsə (preparedQuantity < orderedQuantity)
    const cancelled = orders.filter(o => o.kitchen_status === 'cancelled');
    const active = orders
      .filter(o => o.kitchen_status !== 'cancelled' && o.items.length > 0 && o.items.some(it => it.preparedQuantity < it.orderedQuantity))
      .sort((a, b) => (b.is_rush ? 1 : 0) - (a.is_rush ? 1 : 0));
    active.push(...cancelled);
    // Hazır: bütün itemlər tam hazırdır
    const ready = orders.filter(o =>
      o.items.length > 0 &&
      o.items.every(it => it.preparedQuantity >= it.orderedQuantity)
    );
    return { activeOrders: active, readyOrders: ready };
  }, [orders]);

  const display = activeTab === 'active' ? activeOrders : readyOrders;

  const isAllItemsReady = (order: Order) =>
    order.items.length > 0 && order.items.every(it => it.preparedQuantity >= it.orderedQuantity);

  // ── Smart Queue: group items by product across all active orders ───────────
  const groupedQueue = useMemo(() => {
    const map = new Map<string, { product_name: string; image_url?: string; totalPending: number; tables: number[] }>();
    activeOrders.forEach(order => {
      order.items.forEach(item => {
        const pending = Math.max(0, item.orderedQuantity - item.preparedQuantity);
        if (pending === 0) return;
        const key = item.product_id || item.product_name;
        const existing = map.get(key);
        if (existing) {
          existing.totalPending += pending;
          if (!existing.tables.includes(order.table_number)) existing.tables.push(order.table_number);
        } else {
          map.set(key, { product_name: item.product_name, image_url: item.image_url, totalPending: pending, tables: [order.table_number] });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending);
  }, [activeOrders]);

  // ── Sifarişi qəbul et — birbaxa 'preparing'-ə keçir
  const acceptOrder = async (order: Order) => {
    const { error } = await supabase.from('orders')
      .update({ kitchen_status: 'preparing', kitchen_accepted_at: new Date().toISOString() })
      .eq('id', order.id);
    if (error) console.error('[acceptOrder] error:', error);
    fetchOrdersRef.current();
  };

  // ── Smart Button məntiqini hesabla ────────────────────────────────────────
  // Mərhələ 1: kitchen_status = null | 'pending' | 'cooking' → "Sifarişi Qəbul Et"
  // Mərhələ 2: kitchen_status = 'preparing'                  → "Təhvil Ver"
  // Mərhələ 3: kitchen_status = 'ready'                       → Hazır tabı
  const getSmartButtonStage = (order: Order): 'accept' | 'deliver' | 'complete' => {
    const allReady = isAllItemsReady(order);
    if (allReady) return 'complete';
    if (order.kitchen_status === 'preparing') return 'deliver';
    return 'accept';
  };

  // ── Sold Out handler ───────────────────────────────────────────────────────
  // Real stock-dan asılı olsun: həmin məhsulun reseptindəki ingredient-lərin
  // stokunu 0 waste entry ilə inventory_logs-a yaz → trigger avtomatik
  // products.is_available = false edəcək
  const handleSoldOut = async (productId: string, productName: string) => {
    try {
      const { data: recipeRows } = await supabase
        .from('recipes')
        .select('ingredient_id, quantity_required')
        .eq('menu_item_id', productId);
      if (recipeRows && recipeRows.length > 0) {
        for (const r of recipeRows) {
          await supabase.from('inventory_logs').insert({
            ingredient_id: r.ingredient_id,
            type: 'waste',
            quantity: 999999, // bütün stoku waste et (update_stock_on_log trigger-i current_stock = 0 edəcək)
            reason: `Kitchen: ${productName} sold out`,
          });
        }
      } else {
        // Resept yoxdursa fallback: product-u bağla
        await supabase.from('products').update({ is_available: false }).eq('id', productId);
      }
      toast.success(`${productName} bağlandı`, { duration: 3000, style: { background: '#1a0a0a', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', fontWeight: 'bold' } });
    } catch {
      toast.error('Xəta', { duration: 2000 });
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderOrderCard = (order: Order) => {
    const allItemsReady = order.items.length > 0 && order.items.every(it => it.preparedQuantity >= it.orderedQuantity);
    const kitchenStatusLabel = (() => {
      if (order.is_draft || order.kitchen_status === 'reserved') {
        return { text: 'RESERV', color: 'text-indigo-300', badge: 'bg-indigo-500/20 border-indigo-400/30', pulse: true };
      }
      if (allItemsReady)                         return { text: 'Hazırdır',   color: 'text-emerald-300', badge: 'bg-emerald-500/15 border-emerald-400/30', pulse: false };
      if (order.kitchen_status === 'preparing')  return { text: 'Hazırlanır', color: 'text-blue-300',    badge: 'bg-blue-500/15 border-blue-400/30',       pulse: false };
      return { text: 'YENİ', color: 'text-amber-300', badge: 'bg-amber-500/15 border-amber-400/30', pulse: true };
    })();

    const mins = elapsedMinutes(timerBase(order));
    const isDelayed = !!order.kitchen_accepted_at && mins >= delayThreshold && !allItemsReady;
    const stage = getSmartButtonStage(order);

    // Sort: newly-added pending first, then other pending, then ready
    const sortedItems = [...order.items].sort((a, b) => {
      const aNew = isNewlyAdded(a, order) ? 0 : a.kitchen_status === 'pending' ? 1 : 2;
      const bNew = isNewlyAdded(b, order) ? 0 : b.kitchen_status === 'pending' ? 1 : 2;
      if (aNew !== bNew) return aNew - bNew;
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });

    const pendingItems = sortedItems.filter(it => it.preparedQuantity < it.orderedQuantity);
    const readyItems   = sortedItems.filter(it => it.preparedQuantity >= it.orderedQuantity && it.orderedQuantity > 0);

    return (
      <CardWithCollapse
        key={order.id}
        order={order}
        pendingItems={pendingItems}
        readyItems={readyItems}
        allItemsReady={allItemsReady}
        kitchenStatusLabel={kitchenStatusLabel}
        isDelayed={isDelayed}
        stage={stage}
        isNewlyAdded={isNewlyAdded}
        isReadyTab={activeTab === 'ready'}
        onAccept={() => acceptOrder(order)}
        onDeliver={() => markAllReadyAndNotify(order)}
        onComplete={() => updateOrderStatus(order.id, 'completed')}
        isAllItemsReady={() => isAllItemsReady(order)}
        formatTime={(c: string) => formatTime(c, t)}
        t={t}
        onSoldOut={handleSoldOut}
      />
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 sm:p-6 lg:p-8">
      {showWelcome && (
        <WelcomeScreen role="kitchen" onDismiss={() => setShowWelcome(false)} />
      )}

      <AnimatePresence>
        {langLoading && (() => {
          const LANG_TEXT: Record<string, string> = { az: 'DİL DƏYİŞDİRİLİR', en: 'SWITCHING LANGUAGE', ru: 'СМЕНА ЯЗЫКА' };
          const waveChars = (LANG_TEXT[targetLang] || LANG_TEXT.az).split('');
          return (
            <motion.div
              key="lang-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-[200] pointer-events-none"
              style={{ background: 'rgba(4,4,4,0.8)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
            >
              {/* Radial glow */}
              <div style={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)', filter: 'blur(18px)' }} />

              {/* Globe + rings */}
              <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '1px solid rgba(212,175,55,0.12)', borderTopColor: 'rgba(212,175,55,0.85)', borderBottomColor: 'rgba(212,175,55,0.08)', animation: 'orbitCW 2.2s linear infinite', transform: 'scaleY(0.35)', boxShadow: '0 0 8px rgba(212,175,55,0.2)' }} />
                <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', border: '1px solid rgba(212,175,55,0.08)', borderLeftColor: 'rgba(212,175,55,0.75)', borderRightColor: 'rgba(212,175,55,0.06)', animation: 'orbitCCW 1.6s linear infinite', transform: 'rotate(60deg) scaleY(0.4)', boxShadow: '0 0 6px rgba(212,175,55,0.15)' }} />
                <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', border: '1px solid rgba(212,175,55,0.06)', borderTopColor: 'rgba(212,175,55,0.5)', animation: 'orbitCW 1s linear infinite', transform: 'rotate(-30deg) scaleY(0.3)' }} />
                <motion.svg width="48" height="48" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"
                  animate={{ rotateY: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                  style={{ filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.5))' }}
                >
                  <circle cx="12" cy="12" r="10" stroke="rgba(212,175,55,0.5)" strokeWidth="1"/>
                  <path d="M2 12h20" stroke="rgba(212,175,55,0.35)" strokeWidth="0.8"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="rgba(212,175,55,0.7)" strokeWidth="1"/>
                  <path d="M2 7h20M2 17h20" stroke="rgba(212,175,55,0.2)" strokeWidth="0.6"/>
                </motion.svg>
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: 'rgba(212,175,55,0.9)', boxShadow: '0 0 12px 4px rgba(212,175,55,0.5)' }}
                />
              </div>

              {/* Wave text */}
              <div style={{ display: 'flex', gap: 3 }}>
                {waveChars.map((ch, i) => (
                  <motion.span key={i}
                    animate={{ opacity: [0.15, 1, 0.15] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.07 }}
                    style={{ fontSize: ch === ' ' ? 8 : 13, fontWeight: 800, letterSpacing: '0.05em', color: '#D4AF37', width: ch === ' ' ? 6 : 'auto', display: 'inline-block' }}
                  >{ch === ' ' ? '\u00A0' : ch}</motion.span>
                ))}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
            <ChefHat size={22} className="text-[#D4AF37]" />
          </div>
          <div>
            <h1 suppressHydrationWarning className="text-xl font-black text-white/90 leading-none tracking-wide">{t.kitchen_panel || 'Mətbəx'}</h1>
            <p suppressHydrationWarning className="text-sm text-white/30 mt-1">{activeOrders.length} aktiv · {readyOrders.length} hazır</p>
          </div>
          {/* AI Scheduler */}
          <div className="hidden md:block">
            <KitchenAIScheduler />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Language switcher */}
          <div className="flex items-center bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
            {languages.map(lang => (
              <button key={lang.code}
                onClick={() => { setTargetLang(lang.code); setLanguage(lang.code as any); }}
                className={`px-3.5 py-1.5 text-xs font-black rounded-lg transition-all ${language === lang.code ? 'bg-[#D4AF37] text-black' : 'text-white/40 hover:text-white/70'}`}
              >{lang.label}</button>
            ))}
          </div>

          {/* Sound toggle */}
          <button onClick={() => setSoundOn(v => !v)}
            className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all ${soundOn ? 'bg-[#D4AF37]/10 border-[#D4AF37]/25 text-[#D4AF37]' : 'bg-white/[0.03] border-white/[0.08] text-white/30'}`}>
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Logout */}
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/'; }}
            className="w-11 h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/8 hover:border-red-500/20 transition-all">
            <LogOut size={18} />
          </button>

          {/* Tabs */}
          <div className="flex bg-white/[0.04] border border-white/[0.07] rounded-2xl p-1">
            <button onClick={() => setActiveTab('active')}
              className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'active' ? 'bg-white/[0.1] text-white' : 'text-white/35 hover:text-white/60'}`}>
              {t.kitchen_active||'Aktiv'}
              {activeOrders.length > 0 && <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-black ${activeTab === 'active' ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'bg-white/10 text-white/40'}`}>{activeOrders.length}</span>}
            </button>
            <button onClick={() => setActiveTab('ready')}
              className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'ready' ? 'bg-white/[0.1] text-white' : 'text-white/35 hover:text-white/60'}`}>
              {t.kitchen_ready||'Hazır'}
              {readyOrders.length > 0 && <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-black ${activeTab === 'ready' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40'}`}>{readyOrders.length}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* ── Smart Queue ── */}
      {activeTab === 'active' && groupedQueue.length > 0 && (
        <div className="mb-4 bg-white/[0.025] border border-white/[0.06] rounded-xl px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <BarChart2 size={12} className="text-white/30" />
            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Queue</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {groupedQueue.map(g => (
              <div key={g.product_name} className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2">
                {g.image_url && <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0"><img src={g.image_url} alt="" className="w-full h-full object-cover" /></div>}
                <div>
                  <p className="text-white/60 text-[10px] font-semibold leading-tight">{g.product_name}</p>
                  <p className="text-[#D4AF37] text-sm font-black leading-tight">
                    {g.totalPending}×
                    <span className="text-white/30 text-[9px] font-normal ml-1">{g.tables.sort((a,b)=>a-b).join(', ')}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {display.length === 0 && (
        <div className="flex flex-col items-center justify-center h-[50vh] gap-3">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
            <Utensils size={22} className="text-white/15" />
          </div>
          <p className="text-white/25 text-sm">{activeTab === 'active' ? (t.kitchen_no_active || 'Aktiv sifariş yoxdur') : (t.kitchen_no_ready || 'Hazır sifariş yoxdur')}</p>
        </div>
      )}

      {/* ── Order cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 items-start">
        {display.map(renderOrderCard)}
      </div>

      <KitchenToaster />

      {/* ── Undo toast ── */}
      <AnimatePresence>
        {recentAction && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-[#1a1a1a] border border-white/15 shadow-2xl backdrop-blur-xl"
          >
            <span className="text-white/70 text-sm font-medium">{recentAction.label}</span>
            <button
              onClick={handleUndo}
              className="px-3.5 py-1.5 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37] text-sm font-black hover:bg-[#D4AF37]/30 transition-all"
            >↩ Geri qaytar</button>
            <button
              onClick={() => { setRecentAction(null); if (undoTimer.current) clearTimeout(undoTimer.current); }}
              className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white/60 transition-all text-xs"
            >×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
