'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, ShoppingBag, ArrowLeft, Users, GitMerge, X, User, Receipt, Utensils, Package, Car, Pause, Play, SlidersHorizontal, Clock, Flame, Star, MapPin, Edit2, Tag, Armchair, MoreHorizontal, Loader2, Send, Ban, RotateCcw, Trash2, Check, Sparkles, Plus, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import type { PosCart, PosCartItem, LossItem } from '../types/shared';
import { PinGuard } from './PinGuard';
import type { SendOrderButtonStatus } from './SendOrderButton';
import { NumberRoll } from './NumberRoll';
import { RollingNumber } from './RollingNumber';
import { ReturnItemModal } from './ReturnItemModal';
import { Numpad } from './Numpad';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useVirtualKeyboard } from './VirtualKeyboard';
import { TAP } from '../lib/pos-motion';

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
  /** Customer linking — pick from the SHARED customers source (same
   *  /api/customers as the ActionSheet customer section). Attaches customer_id
   *  so the loyalty spine can credit points; both surfaces stay consistent. */
  onSelectCustomer?: (customerId: string | null, customerName: string | null, customerPhone?: string | null) => void;
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
  onVoidSuccess?: () => void | Promise<void>;
  /** Quick-fix 4 — coupon row. Server-validated coupon (amount comes from
   *  /api/campaigns/coupon, never from the client); exclusive with auto
   *  item-campaigns. Persisted onto cart.coupon by the parent. */
  onCouponApplied?: (c: { code: string; campaign_id: string; name: string; discount_amount: number }) => void;
  onCouponRemoved?: () => void;
 }

const STATIONS = [
  { value: 'kitchen', labelKey: 'station_kitchen', icon: '🍳' },
  { value: 'bar', labelKey: 'station_bar', icon: '🍸' },
  { value: 'sushi', labelKey: 'station_sushi', icon: '🍣' },
  { value: 'hot', labelKey: 'station_hot', icon: '🔥' },
];

// Course values follow the frozen 0.4-B DB contract (singular), never 'mains'.
const COURSES = [
  { value: 'appetizer', labelKey: 'course_appetizers' },
  { value: 'main', labelKey: 'course_mains' },
  { value: 'dessert', labelKey: 'course_desserts' },
  { value: 'drink', labelKey: 'course_drinks' },
];

const COURSE_LABEL: Record<string, string> = {
  appetizer: 'Başlanğıc', main: 'Əsas', dessert: 'Dessert', drink: 'İçki',
  // Legacy read/display compatibility (never written to DB)
  appetizers: 'Başlanğıc', mains: 'Əsas', desserts: 'Dessert', drinks: 'İçki',
};
const COURSE_STYLE: Record<string, string> = {
  appetizer: 'bg-sky-500/10 text-sky-600 dark:text-sky-300/80 border-sky-500/20',
  main: 'bg-violet-500/10 text-violet-600 dark:text-violet-300/80 border-violet-500/20',
  dessert: 'bg-pink-500/10 text-pink-600 dark:text-pink-300/80 border-pink-500/20',
  drink: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300/80 border-emerald-500/20',
  // Legacy read/display compatibility
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
  onClearDraft, onBack, orderButtonStatus, onUpdateGuests, onUpdateCustomer, onSelectCustomer, mergedChildNumbers, onRecordLoss,
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
  onVoidSuccess,
  onCouponApplied,
  onCouponRemoved,
}: CartPanelProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const customInputRef = useRef<HTMLInputElement>(null);
  const [globalNote, setGlobalNote] = useState('');
  const [customerEditing, setCustomerEditing] = useState(false);
  const [customerInput, setCustomerInput] = useState('');
  // Customer linking: live suggestions from the shared /api/customers source
  // (identical to the ActionSheet customer section) while typing.
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const customerSugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (customerSugTimerRef.current) clearTimeout(customerSugTimerRef.current); }, []);
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadIndex, setNumpadIndex] = useState<number | null>(null);
  const [seatBusy, setSeatBusy] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [voidMode, setVoidMode] = useState(false);
  const [voidSelection, setVoidSelection] = useState<Record<string, number>>({});
  const [voidLoading, setVoidLoading] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnModalItem, setReturnModalItem] = useState<any>(null);
  const [guestEditing, setGuestEditing] = useState(false);
  const [localGuestCount, setLocalGuestCount] = useState(cart?.guest_count ?? 1);
  const guestEditRef = useRef<HTMLDivElement>(null);
  const [guestSaving, setGuestSaving] = useState(false);
  // ── Wave B #3 upsell offer engine — REMOVED by owner request (2026-09-21) ──
  // The card UI was removed in dc807f83; this pass deletes the dormant
  // plumbing (suggest fetch, accept/dismiss, budget refs) entirely. The
  // server endpoints (/api/upsell/suggest, /api/upsell/outcome) are frozen
  // in place per the API-CHANGE policy.
  // ── Quick-fix 4 — coupon row ────────────────────────────────────────────
  // The discount is SERVER-computed (validate_coupon over the existing
  // campaign engine) — the client only ever proposes a code. Exclusive with
  // auto item-campaigns (UI-enforced: a cart carrying a campaign item cannot
  // take a coupon). Revalidated on cart/dining change; a failed revalidation
  // removes the coupon (the server will re-check on order create anyway).
  const [couponInput, setCouponInput] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const couponRevalidatingRef = useRef(false);

  const couponErrText = useCallback((code?: string): string => {
    switch (code) {
      case 'COUPON_NOT_FOUND': return t('coupon_err_not_found');
      case 'MIN_ORDER_NOT_MET': return t('coupon_err_min_order');
      case 'DINING_TYPE_MISMATCH': return t('coupon_err_dining');
      case 'TABLE_NOT_APPLICABLE': return t('coupon_err_table');
      case 'EMPTY_CART': case 'CODE_REQUIRED': return t('coupon_requires_items');
      default: return code === 'NOT_APPLICABLE' ? t('coupon_err_not_applicable') : t('coupon_err_generic');
    }
  }, [t]);

  const buildCouponPayload = useCallback((code: string) => ({
    code,
    items: (cart?.items || []).map(i => ({ product_id: i.product_id, unit_price: i.unit_price, quantity: i.quantity })),
    // Pre-discount item sum — the RPC compares min_order against the subtotal.
    order_amount: (cart?.items || []).reduce((s, i) => s + (Number(i.unit_price) || 0) * (Number(i.quantity) || 1), 0),
    dining_type: posMode,
    table_number: cart?.table_number ?? null,
  }), [cart, posMode]);

  const applyCoupon = useCallback(async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || !cart || couponBusy) return;
    if (cart.items.length === 0) { toast.error(t('coupon_requires_items')); return; }
    if (cart.items.some(i => i.campaign_id)) { toast.error(t('coupon_conflict')); return; }
    setCouponBusy(true);
    try {
      const res = await apiFetch('/api/campaigns/coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCouponPayload(code)),
      });
      const d = await res.json().catch(() => null);
      if (d?.ok) {
        onCouponApplied?.({
          code,
          campaign_id: d.campaign_id,
          name: d.name || '',
          discount_amount: Number(d.discount_amount) || 0,
        });
        setCouponInput('');
        toast.success(t('coupon_applied_ok'));
      } else {
        toast.error(couponErrText(d?.error));
      }
    } catch {
      toast.error(t('coupon_err_generic'));
    } finally {
      setCouponBusy(false);
    }
  }, [couponInput, cart, couponBusy, t, buildCouponPayload, onCouponApplied, couponErrText]);

  const removeCoupon = useCallback(() => {
    if (!cart?.coupon || couponBusy) return;
    onCouponRemoved?.();
    toast.success(t('coupon_removed_ok'));
  }, [cart, couponBusy, t, onCouponRemoved]);

  // Revalidate when the cart content, dining type or table changes while a
  // coupon is active: a percentage discount may change and the coupon may
  // stop qualifying (min order, dining window, table window). A re-apply with
  // the SAME amount is a no-op, so this cannot loop.
  const cartKey = useMemo(
    () => (cart?.items || []).map(i => `${i.product_id}:${i.unit_price}:${i.quantity}`).join('|'),
    [cart]
  );
  const couponActive = Boolean(cart?.coupon);
  useEffect(() => {
    if (!couponActive || couponRevalidatingRef.current) return;
    const coupon = cart?.coupon;
    if (!coupon) return;
    couponRevalidatingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/campaigns/coupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCouponPayload(coupon.code)),
        });
        const d = await res.json().catch(() => null);
        if (cancelled) return;
        if (d?.ok) {
          if (Number(d.discount_amount) !== Number(coupon.discount_amount)) {
            onCouponApplied?.({
              code: coupon.code,
              campaign_id: coupon.campaign_id,
              name: d.name || coupon.name,
              discount_amount: Number(d.discount_amount) || 0,
            });
          }
        } else if (d?.error !== 'RPC_ERROR' && d?.error !== 'INTERNAL') {
          // Definitive: the coupon no longer qualifies — drop it.
          onCouponRemoved?.();
          toast.error(couponErrText(d?.error));
        }
        // RPC/network errors: keep the coupon; the order create path
        // re-validates server-side before anything is billed.
      } catch {
        // network error — keep the coupon (see above)
      } finally {
        if (!cancelled) couponRevalidatingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      couponRevalidatingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, posMode, cart?.table_number, couponActive]);


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

  useEffect(() => {
    if (returnModalOpen || numpadOpen) {
      closeVk();
      noteInputRef.current?.blur();
    }
    if (returnModalOpen || numpadOpen) setVoidMode(false);
  }, [returnModalOpen, numpadOpen, closeVk]);

  const voidableItems = useMemo(() => {
    if (!cart) return [];
    return cart.items.filter(item => {
      const ks = (item as any).kitchen_status || 'pending';
      return (item.sentQuantity ?? 0) > 0 && ['pending', 'accepted', 'sent', 'preparing'].includes(ks);
    });
  }, [cart]);
  const hasVoidableItems = voidableItems.length > 0;

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

  const voidSelectedCount = Object.keys(voidSelection).length;
  const voidSelectedTotal = Object.entries(voidSelection).reduce((sum, [id, qty]) => {
    const item = cart.items.find(i => (i.id || `idx-${cart.items.indexOf(i)}`) === id);
    return sum + (item ? item.unit_price * qty : 0);
  }, 0);

  // Owner UX (reverted to the previous stepper, 2026-09-22): void selection is
  // a −/count/+ control per line, DIRECT PRESS style — one tap on + selects
  // the whole voidable line, tapping another line moves the selection there
  // (single active line), − clears.
  const selectVoidItem = (id: string, maxQty: number) => {
    setVoidSelection(prev => (prev[id] ? {} : { [id]: maxQty }));
  };
  const deselectVoidItem = (id: string) => {
    setVoidSelection(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Void with manager-PIN fallback (Sprint-1 pattern, same as VoidItemsModal):
  // when the server says the void amount needs void.approve, open the PIN
  // guard and retry with the PIN-verified approver's staffId.
  const [pinGuardOpen, setPinGuardOpen] = useState(false);
  const doVoid = async (approverStaffId?: string | null) => {
    const activeOrder = (cart as any).order_id;
    if (!activeOrder) return;
    setVoidLoading(true);
    try {
      const selections = Object.entries(voidSelection).filter(([id]) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
      if (selections.length === 0) {
        toast.error(t('void_error') || 'Ləğv edilmədi');
        setVoidLoading(false);
        return;
      }
      const payload = selections.map(([id, qty]) => ({
        order_item_id: id,
        quantity: qty,
      }));
      const res = await apiFetch('/api/orders/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: activeOrder, items: payload, approver_staff_id: approverStaffId || null }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const itemNames = selections.map(([id, qty]) => {
          const item = cart.items.find(i => i.id === id);
          return item ? `${qty}x ${item.product_name}` : '';
        }).filter(Boolean).join(', ');
        toast.success(`${itemNames || t('void_success') || 'Ləğv edildi'} — ${voidSelectedTotal.toFixed(2)} ₼ ${t('voided') || 'ləğv edildi'}`);
        setVoidMode(false);
        setVoidSelection({});
        await onVoidSuccess?.();
      } else {
        if (data?.requires_approval || data?.approval_required) {
          // Over-threshold void: manager PIN fallback (server re-verifies
          // the approver's void.approve — PIN is only the client gate).
          setPinGuardOpen(true);
        } else {
          toast.error(data.error || t('void_error') || 'Ləğv edilmədi', { id: 'pos-hint', duration: 4000 });
          await onVoidSuccess?.();
          setVoidSelection({});
        }
      }
    } catch {
      toast.error(t('network_error') || 'Şəbəkə xətası');
    } finally {
      setVoidLoading(false);
    }
  };
  const handleVoidConfirm = () => {
    if (voidSelectedCount === 0) return;
    void doVoid(null);
  };

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
    // Table is empty + products in cart: placeOrder already marks the table
    // as occupied on the server (POST /api/orders sets status 'occupied'),
    // so do not run a separate seat — otherwise both actions fire at once.
    onPlaceOrder();
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

  // Quick-fix 4: the validated coupon is an ORDER-LEVEL discount — /api/orders
  // subtracts it exactly once on create (deduped by campaign_id on appends),
  // so the footer mirrors the same math for display.
  const couponDiscount = cart.coupon ? Math.max(0, Number(cart.coupon.discount_amount) || 0) : 0;
  if (couponDiscount > 0) total = Math.max(0, total - couponDiscount);

  const cartDiscountAmount = Math.max(0, originalTotal - total);
  const vatAmount = total / (1 + vatRate) * vatRate;
  const grandTotal = total;

  const cycleCourse = (idx: number) => {
    const item: any = cart?.items[idx];
    if (!item || item.sentQuantity) return;
    const values = COURSES.map(c => c.value);
    const cur = values.includes(item.course) ? item.course : 'main';
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
                <div className="flex flex-col gap-1 mt-1 w-full max-w-[240px]">
                  <div className="flex items-center gap-1.5">
                    <User size={12} className="text-blue-400" />
                    <input
                      autoFocus
                      value={customerInput}
                      onChange={(e) => {
                        setCustomerInput(e.target.value);
                        // Linked source: suggest existing customers (same
                        // /api/customers as the ActionSheet customer section)
                        // while typing, so a customer_id gets attached.
                        if (customerSugTimerRef.current) clearTimeout(customerSugTimerRef.current);
                        const q = e.target.value.trim();
                        if (q.length < 2) { setCustomerSuggestions([]); return; }
                        customerSugTimerRef.current = setTimeout(async () => {
                          try {
                            const res = await apiFetch(`/api/customers?q=${encodeURIComponent(q)}&limit=6`);
                            if (res.ok) {
                              const data = await res.json();
                              setCustomerSuggestions(Array.isArray(data) ? data : []);
                            }
                          } catch { setCustomerSuggestions([]); }
                        }, 300);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onUpdateCustomer?.(customerInput.trim() || null);
                          setCustomerSuggestions([]);
                          setCustomerEditing(false);
                        }
                        if (e.key === 'Escape') {
                          setCustomerSuggestions([]);
                          setCustomerEditing(false);
                          setCustomerInput('');
                        }
                      }}
                      onBlur={() => {
                        // No suggestion picked → free-text name fallback (old behavior)
                        onUpdateCustomer?.(customerInput.trim() || null);
                        setCustomerSuggestions([]);
                        setCustomerEditing(false);
                      }}
                      placeholder={t('customer_name_placeholder')}
                       className={`flex-1 min-w-0 rounded-lg px-2 py-0.5 text-xs font-bold outline-none border transition-all ${lightMode ? 'bg-white border-blue-300 text-black focus:border-zinc-400' : 'bg-white/5 border-blue-500/30 text-white focus:border-zinc-400/50'}`}
                    />
                  </div>
                  {customerSuggestions.length > 0 && (
                    <div className={`flex flex-col rounded-xl border overflow-hidden shadow-lg ${lightMode ? 'bg-white border-blue-200' : 'bg-[#12141c] border-white/10'}`}>
                      {customerSuggestions.map((c: any) => (
                        <button key={c.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onSelectCustomer?.(c.id, c.name, c.phone || null);
                            setCustomerSuggestions([]);
                            setCustomerEditing(false);
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-blue-500/10">
                          <User size={11} className="text-blue-400 shrink-0" />
                          <span className={`text-xs font-bold truncate ${lightMode ? 'text-black' : 'text-white'}`}>{c.name}</span>
                          {c.phone && <span className={`text-[10px] shrink-0 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : cart.customer_name ? (
                <button onClick={() => { setCustomerEditing(true); setCustomerInput(cart.customer_name || ''); }}
                  className="flex items-center gap-1.5 mt-1 group">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${lightMode ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-400'}`}>
                    {cart.customer_name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-xs font-bold text-blue-400 truncate">{cart.customer_name}</span>
                  {/* Loyalty-linked customer (has customer_id → points accrue) */}
                  {customerId && <Star size={11} className="text-amber-400 shrink-0" />}
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

      {/* Cart Quick Actions Row — Təmizlə (clear) + Ləğv et (void) morphing */}
      {!isEmpty && (
        <div className={`pt-3 pb-4 mb-2 border-t ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
          <div className="flex gap-2">
            <motion.div
              initial={false}
              animate={{
                flex: hasDraft ? '1 1 0%' : '0 0 0%',
                opacity: hasDraft ? 1 : 0,
                scale: hasDraft ? 1 : 0.9,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
              style={{ overflow: 'hidden', minWidth: 0 }}
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
            <motion.div
              initial={false}
              animate={{
                flex: hasVoidableItems ? '1 1 0%' : '0 0 0%',
                opacity: hasVoidableItems ? 1 : 0,
                scale: hasVoidableItems ? 1 : 0.9,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
              style={{ overflow: 'hidden', minWidth: 0 }}
            >
              <button
                onClick={() => {
                  if (voidMode) {
                    setVoidMode(false);
                    setVoidSelection({});
                  } else {
                    setVoidMode(true);
                  }
                }}
                title={t('void_items') || 'Ləğv et'}
                tabIndex={hasVoidableItems ? 0 : -1}
                style={{ pointerEvents: hasVoidableItems ? 'auto' : 'none', width: '100%' }}
                className={`flex items-center justify-center w-full h-full py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.15em] border transition-all ${
                  voidMode
                    ? lightMode
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-lg shadow-black/10'
                      : 'bg-white text-black border-white shadow-lg shadow-white/10'
                    : lightMode
                      ? 'bg-[var(--theme-surface)] border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
                      : 'bg-white/5 border-[var(--theme-border)] text-white/40 hover:text-white/70 hover:bg-white/10'
                }`}
              >
                {voidMode ? <X size={12} className="mr-1.5" /> : <Ban size={12} className="mr-1.5" />}
                {voidMode ? (t('cancel') || 'Ləğv et') : (t('void_items') || 'Ləğv et')}
              </button>
            </motion.div>
          </div>
        </div>
      )}

        {/* Items — void mode indicator: a thin rose strip on top (owner 2026-09-21:
            the FULL background tint was too aggressive — strip + the inverted
            VOID toggle button are the signals). */}
        {/* QA bug 2 (2026-09-22): the 4th+ cart line was invisible — the list
            scrolled but with no scrollbar and no affordance (clientHeight 276
            vs scrollHeight 332). Thin visible scrollbar + bottom fade now make
            the overflow discoverable. */}
        <div
          className="flex-1 py-3 relative overflow-y-auto min-h-0 overscroll-contain cart-scroll-thin"
          style={{
            paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : 0,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(120,120,140,0.45) transparent',
          }}
        >
          <style>{`
            .cart-scroll-thin::-webkit-scrollbar { width: 6px; }
            .cart-scroll-thin::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
            .cart-scroll-thin::-webkit-scrollbar-thumb { background: rgba(120,120,140,0.45); border-radius: 999px; }
            .cart-scroll-thin::-webkit-scrollbar-thumb:hover { background: rgba(120,120,140,0.7); }
          `}</style>
          <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-rose-500/80 via-rose-400 to-rose-500/80 transition-opacity duration-200 ${voidMode ? 'opacity-100' : 'opacity-0'}`} />
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
            const ks = (item as any).kitchen_status || 'pending';
            const isVoidableItem = voidMode && (item.sentQuantity ?? 0) > 0 && ['pending', 'accepted', 'sent', 'preparing'].includes(ks);
            const maxVoidQty = item.sentQuantity || item.quantity;

            return (
              <motion.div
                key={lineKey}
                layout={!voidMode}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                data-cart-item
                onClick={() => {
                  if (voidMode && !isVoidableItem) {
                    const readyStates = ['ready', 'completed', 'served'];
                    if (readyStates.includes(ks)) {
                      toast(t('hint_void_not_ready') || 'Servis olunub — ləğv etmək olmaz, "Geri qaytar" istifadə edin', { id: 'pos-hint', duration: 3500 });
                    } else if ((item.sentQuantity ?? 0) > 0) {
                      toast(t('hint_void_not_sent') || 'Mətbəxə göndərilməyib — "Ləğv et" ilə ləğv edin', { id: 'pos-hint', duration: 3500 });
                    }
                  }
                }}
                 className={`relative mb-2 overflow-hidden rounded-2xl border bg-[var(--theme-surface-muted)] shadow-[0_1px_3px_rgba(255,255,255,0.04)] px-3.5 py-3 transition-[border-color,box-shadow] duration-300 ${voidMode && !isVoidableItem ? 'opacity-50 border-[var(--theme-border)]' : 'border-[var(--theme-border)]'} ${voidMode && isVoidableItem && (voidSelection[item.id || `idx-${originalIdx}`] || 0) > 0 ? (lightMode ? 'bg-rose-50/70 border-rose-300' : 'bg-rose-500/10 border-rose-400/50') : ''}`}
              >
                 {/* Void selection lines — rose (void color), and they now
                     FADE OUT on "−" (AnimatePresence exit) instead of
                     vanishing instantly. */}
                 <AnimatePresence initial={false}>
                   {voidMode && isVoidableItem && (voidSelection[item.id || `idx-${originalIdx}`] || 0) > 0 && (
                     <motion.div
                       key="void-lines"
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}
                       className="pointer-events-none absolute inset-0"
                     >
                       <motion.span
                         initial={{ scaleX: 0 }}
                         animate={{ scaleX: 1 }}
                         transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                         style={{ transformOrigin: 'left' }}
                         className={`absolute top-0 left-0 right-0 h-[2px] ${lightMode ? 'bg-gradient-to-r from-rose-500/90 via-rose-400 to-rose-500/90' : 'bg-gradient-to-r from-rose-400/90 via-rose-300 to-rose-400/90'}`}
                       />
                       <motion.span
                         initial={{ scaleX: 0 }}
                         animate={{ scaleX: 1 }}
                         transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1], delay: 0.06 }}
                         style={{ transformOrigin: 'right' }}
                         className={`absolute bottom-0 left-0 right-0 h-[2px] ${lightMode ? 'bg-gradient-to-r from-rose-500/90 via-rose-400 to-rose-500/90' : 'bg-gradient-to-r from-rose-400/90 via-rose-300 to-rose-400/90'}`}
                       />
                     </motion.div>
                   )}
                 </AnimatePresence>
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-[var(--theme-text)]">{item.product_name}</p>
                    {item.modifiers?.length ? (
                      <p className="text-xs truncate text-[var(--theme-text-secondary)]">{(item.modifiers ?? []).map(m => m.name).join(', ')}</p>
                    ) : null}
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                       {/* Course chip — visible BEFORE and AFTER send to kitchen
                           (was hidden once sent: "course send etdikden sonra itir").
                           After send it is read-only (kitchen grouping is fixed). */}
                       {(item as any).course && (
                         item.sentQuantity ? (
                           <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold tracking-normal opacity-80 ${COURSE_STYLE[(item as any).course] || COURSE_STYLE.main}`}>
                             {COURSE_LABEL[(item as any).course] || (item as any).course}
                           </span>
                         ) : (
                           <button
                             onClick={() => cycleCourse(originalIdx)}
                             className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold tracking-normal transition-all active:scale-95 ${COURSE_STYLE[(item as any).course] || COURSE_STYLE.main}`}
                             title="Xidmət ardıcıllığı (dəyişmək üçün toxun)"
                           >
                             {COURSE_LABEL[(item as any).course] || (item as any).course}
                           </button>
                         )
                       )}
                       {(item.hold_until || (item as any).is_hold) && (
                         <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-[10px] font-semibold tracking-normal text-orange-600 dark:text-orange-300/80"><Pause size={9} />Saxlanılıb</span>
                       )}
                       {/* Allergen flags (customer allergy → kitchen warning),
                           set in the product modal; persisted in order_items.allergens */}
                       {(item as any).allergens?.length > 0 && (
                         <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-[10px] font-semibold tracking-normal text-red-600 dark:text-red-300/90"
                           title={String((item as any).allergens).replace(/["\[\],]/g, '')}>
                           <AlertTriangle size={9} />{String((item as any).allergens).replace(/["\[\],]/g, ' · ')}
                         </span>
                       )}
                     </div>
                  </div>
                   <span className={`text-sm font-black tabular-nums min-w-[4rem] text-right ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                     {(item.unit_price * item.quantity).toFixed(2)} ₼
                   </span>
                     {voidMode && isVoidableItem ? (
                       <div className="flex items-center gap-2">
                         <div className="flex items-center rounded-xl border border-[var(--theme-border)] overflow-hidden">
                           <motion.button
                             onClick={() => deselectVoidItem(item.id || `idx-${originalIdx}`)}
                             whileTap={{ scale: 0.88 }} transition={TAP}
                             className="w-10 h-10 flex items-center justify-center text-lg font-black hover:bg-[var(--theme-surface-soft)] disabled:opacity-30"
                             disabled={!(voidSelection[item.id || `idx-${originalIdx}`] ?? 0)}
                           >−</motion.button>
                           <span className="w-10 h-10 flex items-center justify-center text-sm font-black tabular-nums text-[var(--theme-text)]">{voidSelection[item.id || `idx-${originalIdx}`] || '—'}</span>
                           <motion.button
                             onClick={() => selectVoidItem(item.id || `idx-${originalIdx}`, maxVoidQty)}
                             whileTap={{ scale: 0.88 }} transition={TAP}
                             className="w-10 h-10 flex items-center justify-center text-lg font-black hover:bg-[var(--theme-surface-soft)]"
                           >+</motion.button>
                         </div>
                       </div>
                     ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-xl border border-[var(--theme-border)] overflow-hidden">
                        <button
                          onClick={() => {
                            const ks = (item as any).kitchen_status;
                            const draftQty = (item.quantity ?? 0) - (item.sentQuantity ?? 0);
                            if (ks && draftQty <= 0) {
                              if (['ready', 'completed', 'served'].includes(ks)) {
                                toast(t('hint_return_item') || 'Servis edilib — "Geri qaytar" istifadə edin', { id: 'pos-hint', duration: 3500 });
                              } else if (['sent', 'preparing', 'pending', 'accepted', 'cooking'].includes(ks)) {
                                toast(t('hint_void_item') || 'Mətbəxə göndərilib — "Ləğv et" istifadə edin', { id: 'pos-hint', duration: 3500 });
                              } else {
                                toast(t('hint_minus_blocked') || 'Bu məhsulu azaltmaq olmaz — "Ləğv et" və ya "Geri qaytar" istifadə edin', { id: 'pos-hint', duration: 3500 });
                              }
                              return;
                            }
                            onUpdateQty?.(originalIdx, -1);
                          }}
                          aria-disabled={!!(item as any).kitchen_status && ((item.quantity ?? 0) - (item.sentQuantity ?? 0)) <= 0}
                          className={`w-11 h-11 flex items-center justify-center text-lg font-black transition-colors active:scale-95 ${(item as any).kitchen_status && ((item.quantity ?? 0) - (item.sentQuantity ?? 0)) <= 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}
                        >−</button>
                        <span className="w-12 h-11 flex items-center justify-center text-sm font-black tabular-nums">{item.quantity}</span>
                       <motion.button
                         whileTap={{ scale: 0.95, transition: { type: 'spring', stiffness: 400, damping: 35, mass: 0.4 } }}
                         onClick={() => onUpdateQty?.(originalIdx, 1)}
                         className="w-11 h-11 flex items-center justify-center text-lg font-black hover:bg-white/10 transition-colors active:scale-95"
                       >+</motion.button>
                     </div>
                    {/* QA bug 14 (2026-09-22): all line action buttons now share
                        the stepper's 44px box (h-11 w-11) — the old p-2 icon
                        buttons were ~32px and sat off-axis with the +/− column. */}
                    {!item.sentQuantity && (
                      <button
                        onClick={() => toggleHold(item, originalIdx)}
                        className={`w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 ${(item as any).is_hold
                          ? 'bg-orange-500/10 border-orange-500/25 text-orange-600 dark:text-orange-300/80 hover:bg-orange-500/20'
                          : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}
                        title={(item as any).is_hold ? 'Bərpa et' : 'Saxla (mətbəxə göndərmə)'}
                      >
                        {(item as any).is_hold ? <Play size={16} /> : <Pause size={16} />}
                      </button>
                    )}
                    <button onClick={() => onRequestEditor?.(item.product_id, originalIdx)} className={`w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`} title={t('details')}>
                      <SlidersHorizontal size={16} />
                    </button>
                    {(() => {
                      const ks = (item as any).kitchen_status || 'pending';
                      const isReturnable = ['ready', 'completed', 'served'].includes(ks);
                      if (!isReturnable) return null;
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReturnModalItem({
                              order_item_id: item.id,
                              product_name: item.product_name,
                              quantity: item.quantity,
                              unit_price: item.unit_price,
                              kitchen_status: ks,
                            });
                            setReturnModalOpen(true);
                          }}
                          title={t('return_item') || 'Geri qaytar'}
                          className={`flex items-center gap-1 px-2.5 h-11 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                            lightMode ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100' : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
                          }`}
                        >
                          <RotateCcw size={14} />
                          <span className="hidden min-[360px]:inline">{t('return_item') || 'Geri qaytar'}</span>
                        </button>
                      );
                    })()}
                    </div>
                    )}
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
        {/* Wave B #3 floating offer (upsell) card — REMOVED by owner request
            (2026-09-21): "modal içi kupon kodu və upsell rədd et". The offer
            plumbing (fetch/accept/dismiss) is kept dormant below. */}
      </div>

      {/* Footer */}
      <AnimatePresence initial={false} mode="wait">
        {voidMode ? (
          <motion.div
            key="void-footer"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="flex-shrink-0 pt-4 pb-6 border-t border-[var(--theme-border)] px-1"
          >
            <div className={`rounded-2xl border px-4 py-3.5 ${lightMode ? 'bg-[var(--theme-surface)] border-zinc-200 shadow-sm' : 'bg-[var(--theme-surface-muted)] border-[var(--theme-border)]'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
                  <Ban size={14} className="flex-shrink-0" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black tracking-wide leading-none mb-1 ${lightMode ? 'text-zinc-800' : 'text-white/90'}`}>
                    {t('void_mode_title') || 'Ləğv rejimi'}
                  </p>
                  <p className={`text-xs font-medium leading-tight truncate ${lightMode ? 'text-zinc-500' : 'text-white/50'}`}>
                    {t('void_mode_explanation') || 'Ləğv etmək istədiyiniz məhsulu "+" ilə seçin'}
                  </p>
                </div>
                {voidSelectedCount > 0 && (
                  <span className={`flex-shrink-0 rounded-full px-3 py-1.5 text-sm font-black tabular-nums ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
                    {voidSelectedCount}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="std-footer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
             className="flex-shrink-0 pt-4 pb-6 border-t space-y-3 border-[var(--theme-border)]"
           >
          {/* Coupon code row — REMOVED by owner request (2026-09-21):
              "modal içi kupon kodu rədd et". (Server coupon validation is
              untouched; the cart.coupon field still applies if set.) */}
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
      </motion.div>
        )}
      </AnimatePresence>
      </>)}

      {/* ═══ Unified morph action button — stable morph, no blink ═══ */}
      {(() => {
        if (!isDineInContext && isEmpty) return null;
        const showActions = isDineInContext && hasExistingOrder && !hasDraft && orderButtonStatus === 'idle';
        const hasCartItems = cart.items.length > 0;
        const btnAction = voidMode ? 'void' : (hasCartItems ? 'send' : canSeat ? 'seat' : showActions ? 'actions' : 'send');
        const btnLabel = voidMode
          ? voidSelectedCount > 0
            ? (t('confirm_void') || 'Ləğv et')
            : (t('void_select_prompt') || 'Ləğv edəcəyiniz məhsulları seçin')
          : orderButtonStatus === 'loading'
            ? t('loading')
            : hasCartItems
              ? (hasExistingOrder ? t('resend') : t('send_to_kitchen'))
              : canSeat
                ? t('seat_table')
                : showActions
                  ? t('actions')
                  : (hasExistingOrder ? t('resend') : t('send_to_kitchen'));
        const btnDisabled = voidMode ? (voidSelectedCount === 0 || voidLoading) : (seatBusy || orderButtonStatus === 'loading');
        const btnBg = voidMode
          ? (lightMode ? 'bg-zinc-900 text-white shadow-xl shadow-black/10 hover:bg-zinc-800' : 'bg-white text-black shadow-xl shadow-white/5')
          : hasCartItems
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
              layout
              initial={false}
              whileHover={{ scale: btnDisabled ? 1 : 1.015 }}
              whileTap={{ scale: btnDisabled ? 1 : 0.99 }}
              transition={{ layout: { duration: 0.35, ease: [0.32, 0.72, 0, 1] } }}
              disabled={btnDisabled}
              onClick={voidMode
                ? handleVoidConfirm
                : (hasCartItems && canSeat) ? handleSeatAndSend : canSeat ? handleSeatTable : (showActions && onOpenActions ? onOpenActions : onPlaceOrder)}
              className={`h-[72px] w-full rounded-4xl font-black uppercase tracking-[0.2em] text-[13px] flex items-center justify-center gap-3 transition-all duration-300 ease-out ${btnDisabled ? (voidMode ? 'cursor-not-allowed opacity-70' : 'cursor-wait opacity-80') : 'cursor-pointer'} ${btnBg}`}
            >
              {(() => {
                const icon = voidMode
                  ? (voidLoading ? <Loader2 size={20} className="animate-spin" /> : voidSelectedCount > 0 ? <Check size={18} /> : <Ban size={16} />)
                  : (seatBusy || orderButtonStatus === 'loading' ? <Loader2 size={20} className="animate-spin" /> : hasCartItems && canSeat ? <Send size={16} /> : canSeat ? <Armchair size={18} /> : showActions ? <MoreHorizontal size={18} /> : <Send size={16} />);
                const counter = voidMode && voidSelectedCount > 0
                  ? <span key="void-count" className="inline-flex items-center justify-center min-w-[30px] h-[30px] rounded-full px-2 text-xs font-black tabular-nums bg-black/15 text-current">{voidSelectedCount}</span>
                  : null;
                return (
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={`cta-${btnAction}`}
                      initial={{ opacity: 0, y: 14, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -14, scale: 0.92 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      className="flex items-center justify-center gap-2.5 min-w-0"
                    >
                      {icon}
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[280px]">{btnLabel}</span>
                      {counter}
                    </motion.span>
                  </AnimatePresence>
                );
              })()}
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

    {/* Return Item Modal */}
    <ReturnItemModal
      open={returnModalOpen}
      onClose={() => { setReturnModalOpen(false); setReturnModalItem(null); }}
      orderId={(cart as any).order_id || ''}
      item={returnModalItem}
      onSuccess={() => { setReturnModalOpen(false); setReturnModalItem(null); }}
    />

    {/* Void over-threshold: manager PIN fallback (server re-verifies approver) */}
    <PinGuard
      open={pinGuardOpen}
      onClose={() => setPinGuardOpen(false)}
      onVerified={(verified) => {
        setPinGuardOpen(false);
        if (verified?.valid && verified.staffId) {
          void doVoid(verified.staffId);
        }
      }}
      action="void"
      title={t('void_pin_required') || 'Manager PIN'}
    />

    </>
  );
}
