'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, ShoppingBag, ArrowLeft, Users, GitMerge, X, User, Receipt, Utensils, Package, Car, Pause, Play, Hash, Clock, Flame, Star, MapPin, Edit2, Tag, Armchair, MoreHorizontal, Loader2, Send, Ban, RotateCcw, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import type { PosCart, PosCartItem, LossItem } from '../types/shared';
import type { SendOrderButtonStatus } from './SendOrderButton';
import { NumberRoll } from './NumberRoll';
import { RollingNumber } from './RollingNumber';
import { VoidItemsModal } from './VoidItemsModal';
import { ReturnItemModal } from './ReturnItemModal';
import { Numpad } from './Numpad';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useVirtualKeyboard } from './VirtualKeyboard';

interface CartPanelProps {
  cart: PosCart | null;
  cartHydrating?: boolean;
  onUpdateQty: (index: number, delta: number) => void;
  onPlaceOrder: () => void;
  onClearDraft: () => void;
  onBack: () => void;
  orderButtonStatus: SendOrderButtonStatus;
  onUpdateGuests?: (delta: number) => void;
  onUpdateCustomer?: (name: string | null) => void;
  mergedChildNumbers?: number[];
  onRecordLoss?: (items: LossItem[], reason: string) => Promise<void>;
  hasExistingOrder?: boolean;
  isDirty?: boolean;
  isReservationMode?: boolean;
  reservation?: {
    reservation_id: string;
    table_number: number;
    name: string | null;
    phone: string | null;
    time: string | null;
    guests: number;
    is_vip?: boolean | null;
  } | null;
  reservationPreOrderItems?: any[];
  onGuestArrived?: () => void;
  customerId?: string | null;
  customerName?: string | null;
  onUpdateItem?: (index: number, patch: Partial<PosCartItem>) => void;
  onUpdateOrderType?: (type: 'dine_in' | 'takeaway' | 'delivery') => void;
  posMode?: 'dine_in' | 'takeaway' | 'delivery';
  onEditGuestCount?: () => void;
  onGuestCountSaved?: (count: number) => void;
  onUpdateDeliveryFields?: (fields: {
    customer_phone?: string | null; customer_name?: string | null;
    delivery_address?: string | null; delivery_district?: string | null;
    delivery_street?: string | null; delivery_building?: string | null;
    delivery_floor?: string | null; delivery_apartment?: string | null;
    delivery_intercom?: string | null; delivery_zone?: string | null;
    delivery_fee?: number; estimated_delivery_time?: string | null;
    scheduled_date?: string | null; payment_method?: string;
    notes?: string;
  }) => void;
  onUpdateGlobalNote?: (note: string) => void;
  onOpenModifiers?: (productId: string) => void;
  onRequestEditor?: (productId: string, lineIndex?: number) => void;
  tableStatus?: string | null;
  tableGuests?: number | null;
  onSeatTable?: () => void | Promise<void>;
  onOpenActions?: () => void;
}

const STATIONS = [
  { value: 'kitchen', labelKey: 'station_kitchen', icon: '🍳' },
  { value: 'bar', labelKey: 'station_bar', icon: '🍸' },
  { value: 'sushi', labelKey: 'station_sushi', icon: '🍣' },
  { value: 'hot', labelKey: 'station_hot', icon: '🔥' },
];

const COURSES = [
  { value: 'appetizers', labelKey: 'course_appetizers' },
  { value: 'mains', labelKey: 'course_mains' },
  { value: 'desserts', labelKey: 'course_desserts' },
  { value: 'drinks', labelKey: 'course_drinks' },
];

const COURSE_LABEL: Record<string, string> = {
  appetizers: 'Başlanğıc', mains: 'Əsas', desserts: 'Dessert', drinks: 'İçki',
};
const COURSE_STYLE: Record<string, string> = {
  appetizers: 'bg-sky-500/10 text-sky-600 dark:text-sky-300/80 border-sky-500/20',
  mains: 'bg-violet-500/10 text-violet-600 dark:text-violet-300/80 border-violet-500/20',
  desserts: 'bg-pink-500/10 text-pink-600 dark:text-pink-300/80 border-pink-500/20',
  drinks: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300/80 border-emerald-500/20',
};

const PRIORITIES = [
  { value: 'normal', labelKey: 'priority_normal', color: 'gray' },
  { value: 'high', labelKey: 'priority_high', color: 'orange' },
  { value: 'vip', labelKey: 'priority_vip', color: 'purple' },
  { value: 'birthday', labelKey: 'priority_birthday', color: 'pink' },
  { value: 'allergy', labelKey: 'priority_allergy', color: 'red' },
];

export function CartPanel({
  cart, cartHydrating = false, onUpdateQty, onPlaceOrder,
  onClearDraft, onBack, orderButtonStatus, onUpdateGuests, onUpdateCustomer, mergedChildNumbers, onRecordLoss,
  hasExistingOrder = false, isDirty = false,
  isReservationMode = false, reservation,
  reservationPreOrderItems = [],
  onGuestArrived,
  customerId, customerName,
  onUpdateItem,
  onUpdateOrderType,
  posMode = 'dine_in',
  onEditGuestCount,
  onGuestCountSaved,
  onUpdateDeliveryFields,
  onUpdateGlobalNote,
  onOpenModifiers,
  onRequestEditor,
  tableStatus,
  tableGuests,
  onSeatTable,
  onOpenActions,
}: CartPanelProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const customInputRef = useRef<HTMLInputElement>(null);
  const [globalNote, setGlobalNote] = useState('');
  const [customerEditing, setCustomerEditing] = useState(false);
  const [customerInput, setCustomerInput] = useState('');
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadIndex, setNumpadIndex] = useState<number | null>(null);
  const [seatBusy, setSeatBusy] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [contextMenuIdx, setContextMenuIdx] = useState<number | null>(null);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidModalItems, setVoidModalItems] = useState<any[]>([]);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnModalItem, setReturnModalItem] = useState<any>(null);
  const [guestEditing, setGuestEditing] = useState(false);
  const [localGuestCount, setLocalGuestCount] = useState(cart?.guest_count ?? 1);
  const guestEditRef = useRef<HTMLDivElement>(null);
  const [guestSaving, setGuestSaving] = useState(false);

  const commitGuestCount = useCallback(async (count: number): Promise<boolean> => {
    setGuestSaving(true);
    try {
      const res = await apiFetch('/api/orders/guest-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: cart?.table_number, guest_count: count }),
      });
      if (res.ok) {
        onGuestCountSaved?.(count);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || 'Qonaq sayı yenilənə bilmədi', { id: 'guest-count-error' });
        return false;
      }
    } catch (e: any) {
      console.error('[guest-count] save failed:', e);
      toast.error(e?.message || 'Qonaq sayı yenilənə bilmədi', { id: 'guest-count-error' });
      return false;
    } finally {
      setGuestSaving(false);
    }
  }, [cart?.table_number, onGuestCountSaved]);

  const handleGuestSave = useCallback(async () => {
    const success = await commitGuestCount(localGuestCount);
    if (success) {
      setGuestEditing(false);
    }
  }, [localGuestCount, commitGuestCount]);
  const { height: vkHeight, isOpen: vkOpen, close: closeVk } = useVirtualKeyboard();
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const loadedNoteRef = useRef('');

  const [vatRate, setVatRate] = useState(0.18);

  const filteredItems = useMemo(() => {
    return cart?.items ?? [];
  }, [cart]);

  useEffect(() => {
    setGlobalNote(cart?.notes || '');
  }, [cart?.notes]);

  useEffect(() => {
    setGlobalNote(cart?.notes || '');
  }, [cart?.notes]);

  useEffect(() => {
    if (contextMenuIdx === null) return;
    const close = () => setContextMenuIdx(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenuIdx]);

  useEffect(() => {
    if (!guestEditing) {
      setLocalGuestCount(cart?.guest_count ?? tableGuests ?? 1);
    }
  }, [cart?.guest_count, tableGuests, guestEditing]);

  useEffect(() => {
    if (!guestEditing) return;
    const handleClickOutside = async (e: MouseEvent) => {
      if (guestEditRef.current && !guestEditRef.current.contains(e.target as Node)) {
        await handleGuestSave();
      }
    };
    const handleEscape = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        await handleGuestSave();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [guestEditing, localGuestCount, guestSaving, handleGuestSave]);

  const ORDER_TYPE_OPTIONS = [
    { value: 'dine_in' as const, label: t('dine_in'), icon: Utensils, color: 'emerald' },
    { value: 'takeaway' as const, label: t('takeaway'), icon: Package, color: 'amber' },
    { value: 'delivery' as const, label: t('delivery'), icon: Car, color: 'blue' },
  ];
  const activeOrderType = cart?.order_type || 'dine_in';

  /* ─── Global note: portal + floating bar above the virtual keyboard ─── */
  const openNoteEditor = () => {
    loadedNoteRef.current = globalNote;
    setIsNoteOpen(true);
  };

  // Save current note (already persisted live on every keystroke) and close.
  const closeNoteEditor = () => {
    setIsNoteOpen(false);
    noteInputRef.current?.blur();
    closeVk();
  };

  // GİZLƏ / LƏĞV ET → revert to the value the note had when the editor opened.
  const discardNote = () => {
    setGlobalNote(loadedNoteRef.current);
    onUpdateGlobalNote?.(loadedNoteRef.current);
    setIsNoteOpen(false);
    noteInputRef.current?.blur();
    closeVk();
  };

  // Keyboard dismissed via its backdrop / Gizlə key / Escape → close the note too.
  // Only when the keyboard was ALREADY open and just closed, so the moment the
  // note opens (keyboard not mounted yet) is never mistaken for a close.
  const vkOpenPrevRef = useRef(vkOpen);
  useEffect(() => {
    const wasOpen = vkOpenPrevRef.current;
    vkOpenPrevRef.current = vkOpen;
    if (wasOpen && !vkOpen && isNoteOpen) {
      setIsNoteOpen(false);
      noteInputRef.current?.blur();
    }
  }, [vkOpen, isNoteOpen]);

  if (!cart) {
    const msg = posMode !== 'dine_in' ? t('no_orders') || (posMode === 'takeaway' ? 'No orders' : 'No orders') : t('no_table_selected');
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-[var(--theme-text-muted)]">
        <ShoppingBag size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-medium">{msg}</p>
        <p className="text-xs mt-1 opacity-60">{t('add_items_hint')}</p>
      </div>
    );
  }

  const originalTotal = cart.items.reduce((s, i) => s + (i.original_unit_price ?? i.unit_price) * i.quantity, 0);
  const isEmpty = cart.items.length === 0;
  const hasDraft = cart.items.some(i => (i.sentQuantity ?? 0) < i.quantity);

  // Contextual primary-action states (dine-in only)
  const isDineInContext = posMode === 'dine_in' && !isReservationMode;
  const canSeat = isDineInContext && !!onSeatTable && ['empty', 'free', 'available'].includes(tableStatus || '');
  const seatedNotOrdered = isDineInContext && tableStatus === 'occupied' && !hasExistingOrder;
  const displayGuests = tableGuests ?? cart.guest_count ?? 1;

  const handleSeatTable = async () => {
    if (seatBusy || !onSeatTable) return;
    setSeatBusy(true);
    try {
      await onSeatTable();
    } finally {
      setSeatBusy(false);
    }
  };

  const handleSeatAndSend = async () => {
    if (seatBusy || !onSeatTable) return;
    setSeatBusy(true);
    try {
      await onSeatTable();
      // After seating, place the order
      onPlaceOrder();
    } finally {
      setSeatBusy(false);
    }
  };

  const headerMeta = (
    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className={`text-sm font-black tabular-nums leading-none ${
          cart.items.length > 0 ? 'text-[var(--theme-text)]' : (lightMode ? 'text-zinc-300' : 'text-white/30')
        }`}>
          {cart.items.length}
        </span>
        <ShoppingBag size={14} className="text-[var(--theme-text-secondary)]" />
        <span className="text-xs text-[var(--theme-text-secondary)]">{t('items')}</span>
      </div>
      {posMode === 'dine_in' && (
        <>
          <span className={`text-xs ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>·</span>
          <div className="flex-shrink-0 overflow-hidden" style={{ width: 200, height: 44 }}>
            <div
              ref={guestEditRef}
              onClick={(e) => { e.stopPropagation(); if (!guestEditing) setGuestEditing(true); }}
              onKeyDown={(e) => { if (!guestEditing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setGuestEditing(true); } }}
              role="button"
              tabIndex={0}
              className="flex items-center gap-1.5 group cursor-pointer relative w-full h-full"
            >
              <Users size={14} className="text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-text)] flex-shrink-0" />
              <div className="flex items-center relative w-full h-full overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  {!guestEditing ? (
                    <motion.div
                      key="guest-display"
                      className="flex items-center gap-1 absolute inset-0"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <span className="text-sm font-black tabular-nums text-[var(--theme-text)] group-hover:text-emerald-400 transition-colors">{cart.guest_count ?? tableGuests ?? 1}</span>
                      <span className="text-xs text-[var(--theme-text-secondary)] group-hover:text-emerald-400 transition-colors">{t('guests')}</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="guest-edit"
                      className="flex items-center gap-1.5 absolute inset-0"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = Math.max(1, localGuestCount - 1);
                          setLocalGuestCount(next);
                        }}
                        disabled={localGuestCount <= 1 || guestSaving}
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] text-xl font-bold leading-none transition-all active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                      >
                        −
                      </button>
                      <span className="text-base font-black tabular-nums text-[var(--theme-text)] min-w-[28px] text-center">{localGuestCount}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = localGuestCount + 1;
                          setLocalGuestCount(next);
                        }}
                        disabled={guestSaving}
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] text-xl font-bold leading-none transition-all active:scale-90"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleGuestSave(); }}
                        disabled={guestSaving}
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 text-sm font-black leading-none transition-all active:scale-90 disabled:opacity-50"
                      >
                        {guestSaving ? '…' : '✓'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const emptyTitle = mergedChildNumbers && mergedChildNumbers.length > 0
    ? `${t('group_label')} ${cart.table_number ?? '-'}`
    : posMode === 'takeaway' ? t('takeaway') : posMode === 'delivery' ? t('delivery') : `${t('table_label')} ${cart.table_number ?? '-'}`;

  let total = originalTotal;
  let campaignDiscount = 0;
  const itemBasedDiscount = cart.items.reduce((s, i) => s + Math.max(0, ((i.original_unit_price ?? i.unit_price) - i.unit_price) * i.quantity), 0);
  if (itemBasedDiscount > 0) {
    campaignDiscount = itemBasedDiscount;
    total = originalTotal - campaignDiscount;
  } else {
    const discountAmount = cart.discount_amount ?? 0;
    if (discountAmount > 0) {
      if (cart.discount_type === 'percentage') {
        total = originalTotal * (1 - discountAmount / 100);
      } else {
        total = Math.max(0, originalTotal - discountAmount);
      }
    }
  }

  const cartDiscountAmount = Math.max(0, originalTotal - total);
  const vatAmount = total / (1 + vatRate) * vatRate;
  const grandTotal = total;

  const cycleCourse = (idx: number) => {
    const item: any = cart?.items[idx];
    if (!item || item.sentQuantity) return;
    const values = COURSES.map(c => c.value);
    const cur = values.includes(item.course) ? item.course : 'mains';
    const next = values[(values.indexOf(cur) + 1) % values.length];
    onUpdateItem?.(idx, { course: next } as any);
  };

  const toggleHold = (item: any, idx: number) => {
    if (item.sentQuantity) return;
    const next = !item.is_hold;
    onUpdateItem?.(idx, { is_hold: next } as any);
    if (item.id) {
      fetch('/api/orders/item-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, is_hold: next }),
      }).catch(() => {});
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        className="flex flex-col flex-1 min-h-0 px-6 relative" style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : 0 }}>
      {/* Header */}
      <div className={`flex items-center justify-between flex-shrink-0 pt-6 ${isReservationMode ? 'pb-3 border-b border-[var(--theme-border)]' : 'pb-4'}`}>
        <div className="flex items-center gap-2">
          <button onClick={onBack}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]">
            <ArrowLeft size={18} />
          </button>
          
          <div>
            <p className="text-lg font-bold text-[var(--theme-text)]">
              <span className="inline-flex items-center gap-2">
                {mergedChildNumbers && mergedChildNumbers.length > 0 ? `${t('group_label')} ${cart.table_number ?? '-'}` : posMode === 'takeaway' ? t('takeaway') : posMode === 'delivery' ? t('delivery') : `${t('table_label')} ${cart.table_number ?? '-'}`}
                {isReservationMode && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)]">PRE-ORDER</span>
                )}
                {seatedNotOrdered && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-black uppercase tracking-widest bg-orange-500/10 border border-orange-500/30 text-orange-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                    {t('seated_no_order')}
                  </span>
                )}
              </span>
              {mergedChildNumbers && mergedChildNumbers.length > 0 && (
                <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold tracking-wider border ${lightMode ? 'bg-zinc-200 border-zinc-300 text-zinc-600' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-300'}`}>
                  <GitMerge size={10} /> {[cart.table_number, ...mergedChildNumbers].join('+')}
                </span>
              )}
            </p>
            {isReservationMode && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs font-medium text-[var(--theme-text-secondary)]">Rezervasiya üçün öncədən sifariş</span>
              </div>
            )}
              {headerMeta}
            {(posMode === 'takeaway' || posMode === 'delivery') && cart.customer_name ? (
              <div className="flex items-center gap-2 mt-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${lightMode ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-400'}`}>
                  {cart.customer_name.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-sm font-bold text-blue-400 truncate">{cart.customer_name}</span>
              </div>
            ) : posMode === 'dine_in' ? (
              customerEditing ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <User size={12} className="text-blue-400" />
                  <input
                    autoFocus
                    value={customerInput}
                    onChange={(e) => setCustomerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onUpdateCustomer?.(customerInput.trim() || null);
                        setCustomerEditing(false);
                      }
                      if (e.key === 'Escape') {
                        setCustomerEditing(false);
                        setCustomerInput('');
                      }
                    }}
                    onBlur={() => {
                      onUpdateCustomer?.(customerInput.trim() || null);
                      setCustomerEditing(false);
                    }}
                    placeholder={t('customer_name_placeholder')}
                     className={`flex-1 min-w-0 rounded-lg px-2 py-0.5 text-xs font-bold outline-none border transition-all ${lightMode ? 'bg-white border-blue-300 text-black focus:border-zinc-400' : 'bg-white/5 border-blue-500/30 text-white focus:border-zinc-400/50'}`}
                  />
                </div>
              ) : cart.customer_name ? (
                <button onClick={() => { setCustomerEditing(true); setCustomerInput(cart.customer_name || ''); }}
                  className="flex items-center gap-1.5 mt-1 group">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${lightMode ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-400'}`}>
                    {cart.customer_name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-xs font-bold text-blue-400 truncate">{cart.customer_name}</span>
                  <span className="text-xs text-[var(--theme-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">{t('edit_customer')}</span>
                </button>
              ) : (
                <button onClick={() => { setCustomerEditing(true); setCustomerInput(''); }}
                  className="flex items-center gap-1.5 mt-1 text-[var(--theme-text-muted)] hover:text-blue-400 transition-colors">
                  <User size={12} />
                  <span className="text-xs font-bold">{t('add_customer')}</span>
                </button>
              )
            ) : null}
            {/* Order type switcher removed — mode is set via top tabs */}

            {/* Payment method selector — handled at checkout via ActionSheet */}
            {campaignDiscount > 0 ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Receipt size={12} className="text-[var(--theme-text-secondary)]" />
                <span className="text-xs font-bold text-[var(--theme-text-secondary)]">
                  {t('campaign_applied')}: −{campaignDiscount.toFixed(2)} ₼
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ═══ Empty state body ═══ */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--theme-text-muted)]">
          <ShoppingBag size={56} className="mb-4 opacity-15" />
          <p className="text-sm font-black uppercase tracking-widest mb-1">{t('no_products')}</p>
          <p className="text-xs mb-6 opacity-60">{t('add_items_hint')}</p>
        </div>
      )}

      {/* ═══ Non-empty state body ═══ */}
      {!isEmpty && (<>
      {/* Compact customer info summary — takeaway/delivery (name shown in header, only show phone/address here) */}
      {(posMode === 'takeaway' || posMode === 'delivery') && (cart.customer_phone || cart.delivery_street) && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 mb-2 rounded-xl text-xs font-semibold ${lightMode ? 'bg-zinc-50 border border-zinc-100 text-zinc-500' : 'bg-white/5 border border-white/5 text-white/40'}`}>
          {cart.customer_phone && (
            <span>{cart.customer_phone}</span>
          )}
          {cart.delivery_street && (
            <span className="truncate max-w-[120px]">
              {cart.delivery_street}{cart.delivery_building ? `, ${cart.delivery_building}` : ''}
            </span>
          )}
        </div>
      )}

      {/* Cart Quick Actions Row — single morphing surface: Təmizlə (clear) left, İtki (write off) right */}
      {!isEmpty && (
        <div className={`pt-3 pb-4 mb-2 border-t ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
          <div className="relative flex items-stretch">
              <motion.div
              initial={false}
              style={{
                flex: 'none',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transformOrigin: 'left center',
              }}
              animate={{
                width: hasDraft ? '50%' : '0%',
                clipPath: hasDraft ? 'inset(0% 0% 0% 0%)' : 'inset(0% 100% 0% 0%)',
                marginRight: hasDraft ? 8 : 0,
              }}
              transition={{
                width: { type: 'tween', duration: 0.55, ease: [0.22, 1.2, 0.36, 1] },
                clipPath: { type: 'tween', duration: 0.55, ease: [0.22, 1.2, 0.36, 1] },
                marginRight: { type: 'tween', duration: 0.55, ease: [0.22, 1.2, 0.36, 1] },
              }}
            >
              <button
                onClick={onClearDraft}
                title={t('clear')}
                tabIndex={hasDraft ? 0 : -1}
                style={{ pointerEvents: hasDraft ? 'auto' : 'none', width: '100%' }}
                className={`flex items-center justify-center w-full h-full py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.15em] border ${
                  lightMode 
                    ? 'bg-white border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50' 
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                }`}
              >
                {t('clear')}
              </button>
            </motion.div>
          </div>
        </div>
      )}

        {/* Items */}
        <div className="flex-1 py-3 relative overflow-y-auto min-h-0 overscroll-contain" style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : 0 }}>
        <div
          className="absolute inset-0 transition-opacity duration-150 ease-in-out"
          style={{ opacity: isEmpty ? 1 : 0, pointerEvents: isEmpty ? 'auto' : 'none' }}
        >
          <div className="flex items-center justify-center h-full text-[var(--theme-text-muted)]">
            <p className="text-sm font-medium">{t('add_items_hint')}</p>
          </div>
        </div>
         <div
          className="transition-opacity duration-150 ease-in-out"
          style={{ opacity: isEmpty ? 0 : 1 }}
        >
          <AnimatePresence initial={false}>
          {filteredItems.map((item, idx) => {
            const originalIdx = cart.items.indexOf(item);
            const lineKey = item.id ?? `${item.product_id}|${item.variant_id ?? ''}|${(item.modifiers ?? []).map(m => `${m.id}:${m.name}`).join(',')}|${item.special_notes ?? ''}`;

            return (
              <motion.div
                key={lineKey}
                layout
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                data-cart-item
                className={`mb-2 rounded-2xl border bg-[var(--theme-surface-muted)] shadow-[0_1px_3px_rgba(255,255,255,0.04)] border-[var(--theme-border)] px-3.5 py-3`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-[var(--theme-text)]">{item.product_name}</p>
                    {item.modifiers?.length ? (
                      <p className="text-xs truncate text-[var(--theme-text-secondary)]">{(item.modifiers ?? []).map(m => m.name).join(', ')}</p>
                    ) : null}
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {!item.sentQuantity && (
                        <button
                          onClick={() => cycleCourse(originalIdx)}
                          className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold tracking-normal transition-all active:scale-95 ${COURSE_STYLE[(item as any).course || 'mains'] || COURSE_STYLE.mains}`}
                          title="Xidmət ardıcıllığı (dəyişmək üçün toxun)"
                        >
                          {COURSE_LABEL[(item as any).course || 'mains'] || (item as any).course || 'Əsas'}
                        </button>
                      )}
                      {(item.hold_until || (item as any).is_hold) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-[10px] font-semibold tracking-normal text-orange-600 dark:text-orange-300/80"><Pause size={9} />Saxlanılıb</span>
                      )}
                    </div>
                  </div>
                   <span className={`text-sm font-black tabular-nums min-w-[4rem] text-right ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                     {(item.unit_price * item.quantity).toFixed(2)} ₼
                   </span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-xl border border-[var(--theme-border)] overflow-hidden">
                        <button onClick={() => onUpdateQty?.(originalIdx, -1)} className="w-11 h-11 flex items-center justify-center text-lg font-black hover:bg-white/10 transition-colors active:scale-95">−</button>
                        <span className="w-12 h-11 flex items-center justify-center text-sm font-black tabular-nums">{item.quantity}</span>
                       <motion.button
                         whileTap={{ scale: 0.95, transition: { type: 'spring', stiffness: 400, damping: 35, mass: 0.4 } }}
                         onClick={() => onUpdateQty?.(originalIdx, 1)}
                         className="w-11 h-11 flex items-center justify-center text-lg font-black hover:bg-white/10 transition-colors active:scale-95"
                       >+</motion.button>
                     </div>
                    {!item.sentQuantity && (
                      <button
                        onClick={() => toggleHold(item, originalIdx)}
                        className={`p-2 rounded-xl border transition-all active:scale-95 ${(item as any).is_hold
                          ? 'bg-orange-500/10 border-orange-500/25 text-orange-600 dark:text-orange-300/80 hover:bg-orange-500/20'
                          : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}
                        title={(item as any).is_hold ? 'Bərpa et' : 'Saxla (mətbəxə göndərmə)'}
                      >
                        {(item as any).is_hold ? <Play size={14} /> : <Pause size={14} />}
                      </button>
                    )}
                    <button onClick={() => onRequestEditor?.(item.product_id, originalIdx)} className={`p-2 rounded-xl border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`} title={t('details')}>
                      <Hash size={14} />
                    </button>
                    {(() => {
                      const ks = (item as any).kitchen_status || 'pending';
                      const isVoidable = item.sentQuantity && ['pending', 'accepted', 'sent', 'preparing'].includes(ks);
                      const isReturnable = ['ready', 'completed', 'served'].includes(ks);
                      if (!isVoidable && !isReturnable) return null;
                      return (
                        <div className="relative">
                          <button onClick={(e) => { e.stopPropagation(); setContextMenuIdx(contextMenuIdx === originalIdx ? null : originalIdx); }}
                            className={`p-2 rounded-xl border transition-all ${contextMenuIdx === originalIdx ? (lightMode ? 'bg-zinc-200 border-zinc-300 text-zinc-700' : 'bg-white/10 border-white/15 text-white') : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}>
                            <MoreHorizontal size={14} />
                          </button>
                          {contextMenuIdx === originalIdx && (
                            <div onClick={(e) => e.stopPropagation()}
                              className={`absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-xl border shadow-xl overflow-hidden ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-800 border-zinc-700'}`}>
                              {isVoidable && (
                                <button onClick={() => {
                                  const activeOrder = (cart as any).order_id;
                                  if (!activeOrder) { setContextMenuIdx(null); return; }
                                  setVoidModalItems([{
                                    id: item.id,
                                    product_name: item.product_name,
                                    quantity: item.quantity,
                                    unit_price: item.unit_price,
                                  }]);
                                  setVoidModalOpen(true);
                                  setContextMenuIdx(null);
                                }}
                                  className={`w-full flex items-center gap-2 px-4 py-3 text-xs font-bold transition-colors ${lightMode ? 'text-rose-600 hover:bg-rose-50' : 'text-rose-400 hover:bg-rose-500/10'}`}>
                                  <Ban size={14} />
                                  {t('void_items') || 'Ləğv et'}
                                </button>
                              )}
                              {isReturnable && (
                                <button onClick={() => {
                                  setReturnModalItem({
                                    order_item_id: item.id,
                                    product_name: item.product_name,
                                    quantity: item.quantity,
                                    unit_price: item.unit_price,
                                    kitchen_status: ks,
                                  });
                                  setReturnModalOpen(true);
                                  setContextMenuIdx(null);
                                }}
                                  className={`w-full flex items-center gap-2 px-4 py-3 text-xs font-bold transition-colors ${lightMode ? 'text-blue-600 hover:bg-blue-50' : 'text-blue-400 hover:bg-blue-500/10'}`}>
                                  <RotateCcw size={14} />
                                  {t('return_item') || 'Geri qaytar'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 pt-4 pb-6 border-t space-y-3 border-[var(--theme-border)]">
        {/* Total */}
        <motion.div
          key="std-total"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-1 space-y-1"
        >
                {/* Subtotal */}
                <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest font-medium text-[var(--theme-text-secondary)]">{t('subtotal_label')}</span>
                   <NumberRoll value={originalTotal} prefix="" suffix=" ₼" decimals={2} className="text-xs font-medium tabular-nums text-[var(--theme-text-secondary)]" />
                </div>
                {/* Discount */}
                {cartDiscountAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest font-medium text-emerald-400">{t('discount_label')}</span>
                    <NumberRoll value={cartDiscountAmount} prefix="−" suffix=" ₼" decimals={2} className="text-xs font-medium tabular-nums text-emerald-400" />
                  </div>
                )}
                {/* VAT */}
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest font-medium text-[var(--theme-text-secondary)]">{t('vat')}</span>
                  <NumberRoll value={vatAmount} prefix="" suffix=" ₼" decimals={2} className="text-xs font-medium tabular-nums text-[var(--theme-text-secondary)]" />
                </div>
                 {/* TOTAL — biggest, most prominent */}
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--theme-border)]">
                    <span className="text-xs uppercase tracking-widest font-bold text-[var(--theme-text-secondary)]">{t('total_label')}</span>
                    <RollingNumber value={grandTotal} prefix="" suffix=" ₼" decimals={2} className="text-[32px] font-black tracking-tight tabular-nums text-[var(--theme-accent)]" duration={0.3} />
                  </div>
             </motion.div>

        {/* Active campaign badge */}
        {campaignDiscount > 0 && (
          <div className={`flex items-center justify-between px-3 py-2 rounded-2xl ${lightMode ? 'bg-zinc-100 border border-zinc-200' : 'bg-white/5 border border-white/10'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${lightMode ? 'bg-zinc-600' : 'bg-white/60'}`} />
               <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>{t('campaign_applied')}</span>
            </div>
          </div>
        )}
          {/* Global note — static trigger; the editor floats via portal above the keyboard */}
          {!isEmpty && posMode === 'dine_in' && (
            <div className="px-1">
              <button
                onClick={openNoteEditor}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-colors ${
                  lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                }`}
              >
                <Tag size={10} />
                <span className="truncate min-w-0 max-w-[220px]">{globalNote ? globalNote : t('add_note')}</span>
              </button>
            </div>
          )}
         {/* Footer actions removed from here */}
      </div>
      </>)}

      {/* ═══ Unified morph action button — stable morph, no blink ═══ */}
      {(() => {
        if (!isDineInContext && isEmpty) return null;
        const showActions = isDineInContext && hasExistingOrder && !hasDraft && orderButtonStatus === 'idle';
        const hasCartItems = cart.items.length > 0;
        const btnAction = hasCartItems ? 'send' : canSeat ? 'seat' : showActions ? 'actions' : 'send';
        const btnLabel = hasCartItems
          ? (hasExistingOrder ? t('resend') : t('send_to_kitchen'))
          : canSeat
            ? t('seat_table')
            : showActions
              ? t('actions')
              : (hasExistingOrder ? t('resend') : t('send_to_kitchen'));
        const btnDisabled = seatBusy;
        const btnBg = hasCartItems
          ? (lightMode ? 'bg-zinc-900 text-white shadow-xl shadow-black/10' : 'bg-white text-black shadow-xl shadow-white/5')
          : canSeat
            ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-900/25 hover:brightness-110'
            : showActions
              ? (lightMode ? 'bg-zinc-900 text-white shadow-xl shadow-black/10 hover:bg-zinc-800' : 'bg-white text-black shadow-xl shadow-white/10 hover:bg-zinc-100')
              : isDirty
                ? (lightMode ? 'bg-zinc-900 text-white shadow-xl shadow-black/10' : 'bg-white text-black shadow-xl shadow-white/5')
                : (lightMode ? 'bg-zinc-200 text-zinc-500' : 'bg-zinc-800 text-white/40');
        return (
          <div className="w-full flex-shrink-0 px-6 pb-5 pt-2">
            <motion.button
              key={`morph-${cart.table_number}`}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ layout: { duration: 0.3, ease: [0.32, 0.72, 0, 1] } }}
              disabled={btnDisabled}
              onClick={(hasCartItems && canSeat) ? handleSeatAndSend : canSeat ? handleSeatTable : (showActions && onOpenActions ? onOpenActions : onPlaceOrder)}
              className={`h-[72px] w-full rounded-4xl font-black uppercase tracking-[0.2em] text-[13px] flex items-center justify-center gap-3 transition-colors duration-300 ${btnDisabled ? 'cursor-wait opacity-80' : 'cursor-pointer'} ${btnBg}`}
            >
              {seatBusy ? <Loader2 size={20} className="animate-spin" /> :
               (hasCartItems && canSeat) ? <Send size={16} /> :
               canSeat ? <Armchair size={18} /> :
               showActions ? <MoreHorizontal size={18} /> :
               <Send size={16} />}
              <motion.span key={btnAction} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                {btnLabel}
              </motion.span>
            </motion.button>
          </div>
        );
      })()}

      {/* Numpad for quantity change */}
      <Numpad
        open={numpadOpen && numpadIndex !== null}
        value={numpadIndex !== null ? cart.items[numpadIndex]?.quantity ?? 1 : 1}
        min={1}
        max={99}
        onClose={() => { setNumpadOpen(false); setNumpadIndex(null); }}
        onConfirm={(val) => {
          if (numpadIndex !== null) {
            const item = cart.items[numpadIndex];
            const diff = val - item.quantity;
            if (diff !== 0) onUpdateQty(numpadIndex, diff);
          }
        }}
      />

      {createPortal(
        <AnimatePresence>
          {isNoteOpen && (
            <motion.div
              key="note-backdrop"
              className="fixed inset-0 bg-black/20 z-[9998]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeNoteEditor}
            />
          )}
          {isNoteOpen && (
            <motion.div
              key="note-bar"
              className={`fixed z-[10000] left-0 right-0 p-4 border-t shadow-elevated flex flex-col gap-3 max-w-2xl mx-auto rounded-t-2xl backdrop-blur-lg ${lightMode ? 'bg-white border-zinc-200' : 'bg-[#25252D] border-white/10'}`}
              style={{ bottom: vkHeight }}
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            >
              <textarea
                ref={noteInputRef}
                autoFocus
                value={globalNote}
                onChange={e => { setGlobalNote(e.target.value); onUpdateGlobalNote?.(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closeNoteEditor(); } }}
                placeholder={t('note_placeholder') || 'Qeyd yaz...'}
                className={`w-full h-24 text-lg p-3 rounded-xl border focus:outline-none resize-none ${lightMode ? 'bg-zinc-50 text-gray-900 border-zinc-200 focus:border-amber-500 placeholder:text-zinc-400' : 'bg-[#18181C] text-white border-white/10 focus:border-amber-500'}`}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={discardNote}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                >
                  GİZLƏ / LƏĞV ET
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={closeNoteEditor}
                  className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-500 text-black hover:bg-emerald-400 transition-colors"
                >
                  TƏSDİQLƏ
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

    </motion.div>

    {/* Void Items Modal */}
    <VoidItemsModal
      open={voidModalOpen}
      onClose={() => { setVoidModalOpen(false); setVoidModalItems([]); }}
      orderId={(cart as any).order_id || ''}
      items={voidModalItems}
      onSuccess={() => { setVoidModalOpen(false); setVoidModalItems([]); }}
    />

    {/* Return Item Modal */}
    <ReturnItemModal
      open={returnModalOpen}
      onClose={() => { setReturnModalOpen(false); setReturnModalItem(null); }}
      orderId={(cart as any).order_id || ''}
      item={returnModalItem}
      onSuccess={() => { setReturnModalOpen(false); setReturnModalItem(null); }}
    />

    </>
  );
}
