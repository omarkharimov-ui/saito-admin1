'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, ShoppingBag, ArrowLeft, Users, GitMerge, X, User, Receipt, Utensils, Handbag, Car, Pause, Play, SlidersHorizontal, Clock, Flame, Star, MapPin, Edit2, Tag, Armchair, MoreHorizontal, Loader2, Send, Ban, Trash2, Check, Sparkles, Plus, AlertTriangle, ChevronRight, Lock, Bike } from '@/components/ui/saito-icons';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import type { PosCart, PosCartItem, LossItem } from '../types/shared';
import { PinGuard } from './PinGuard';
import type { SendOrderButtonStatus } from './SendOrderButton';
// 2026-09-27 (owner RESTORE: "Cart counter-roll qaytar — o daha qəsəngdir"):
// the counter-roll (NumberRoll/RollingNumber) IS the premium feel in the cart.
// Restored byte-for-byte; Morph stays for other surfaces only.
import { NumberRoll } from './NumberRoll';
import { RollingNumber } from './RollingNumber';
import { Numpad } from './Numpad';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { PartnerLogo } from './PartnerBadge';
import { useVirtualKeyboard } from './VirtualKeyboard';
import { TAP, SPRING } from '../lib/pos-motion';
import { parseAllergens, resolveAllergenEntry } from '@/lib/allergens';

interface CartPanelProps {
  // 2026-09-27 (owner): global EDV switch (Settings → Payment → auto_apply_vat).
  // VAT line is HIDDEN when the switch is off (was hardcoded 18% always).
  vatEnabled?: boolean;
  cart: PosCart | null;
  cartHydrating?: boolean;
  onUpdateQty: (index: number, delta: number) => void;
  /** 2026-09-28 (owner P2): group "+" on a spec'd/sent instance clones it into
      a NEW independent cart line (own instance_id + spec copy) instead of
      qty+1 — modifiers must never merge across instances. */
  onCloneInstance?: (lineIndex: number) => void;
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
  /** Opens the customer phase (panel replaces the grid area; cart untouched). */
  onOpenCustomerPhase?: () => void;
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
  /** Called AFTER the guest-count POST commits to the DB — refresh the floor card then (avoids a stale flash). */
  onGuestCountPersisted?: () => void;
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
  /** 2026-09-28 (owner: "eyni mehsul 1 setire collapse olsun + modalda
      instans pill tabları"): the collapsed group row passes ALL of the
      group's cart-line indexes (+ the raw lines) — the editor opens in
      multi-instance mode with TikTok-style pill tabs. */
  onRequestEditor?: (productId: string, lineIndexes?: number | number[], lineItems?: any[]) => void;
  /** Batch line patch (single setCart) — the group hold-toggle rewrites
      several instances at once; N sequential onUpdateItem calls would lose
      updates (stale-closure setCart, last write wins). */
  onUpdateItems?: (patches: { idx: number; patch: Partial<PosCartItem> }[]) => void;
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
  /** 2026-09-25 (owner): boundOrderLabel chip REMOVED ("heç bir tabda elə bir
      şey olmasın") — prop deleted; order number now lives in the dine-in
      ORD chip (cart.order_number) instead.
  /** 2026-09-25 (owner, partner Part 1): when the bound order is a PARTNER
      (aggregator) order, customer info comes from the partner app via API —
      the cart renders it READ-ONLY (no customer phase, no re-entry). */
  partnerSource?: string | null;
  /** The full partner order row (courier/ETA/address fields live on the order,
      not in the cart) — rendered as the read-only "API payload" block. */
  partnerOrder?: any;
  /** 2026-09-26 (owner, Task 50): fee RPC in flight → shimmer on the fee row. */
  feeCalculating?: boolean;
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
  cart, cartHydrating = false, onUpdateQty, onCloneInstance, onPlaceOrder,
  onClearDraft, onBack, orderButtonStatus, onUpdateGuests, onUpdateCustomer, onSelectCustomer, onOpenCustomerPhase, mergedChildNumbers, onRecordLoss,
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
  onGuestCountPersisted,
  onUpdateDeliveryFields,
  onUpdateGlobalNote,
  onOpenModifiers,
  onRequestEditor,
  onUpdateItems,
  tableStatus,
  tableGuests,
  onSeatTable,
  onOpenActions,
  onVoidSuccess,
    onCouponApplied,
    onCouponRemoved,
    partnerSource,
    partnerOrder,
    feeCalculating,
    vatEnabled = true,
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
  // 2026-09-26 (owner): MOVED here from after the `if (!cart) return` early
  // exit (was line ~495) — a hook after a conditional return breaks React's
  // rule of hooks: reserved tables render cart=null first (early exit, N
  // hooks) then the draft order arrives (N+1 hooks) → "Rendered more hooks
  // than during the previous render" crash on every reserved-table tap.
  const [pinGuardOpen, setPinGuardOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [voidMode, setVoidMode] = useState(false);
  const [voidSelection, setVoidSelection] = useState<Record<string, number>>({});
  const [voidLoading, setVoidLoading] = useState(false);
  // 2026-09-24 (owner, FINAL): the standalone ReturnItemModal state is GONE —
  // return now lives inside the details panel (ProductGrid morph).
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
    // 2026-09-27 (owner: "Guest təsdiqi çox gecikir, prosesi uzun çəkir") —
    // OPTIMISTIC: the UI (cart chip) updates on the TAP, not after the network
    // round-trip. The old code did `await POST` (1 SELECT + N PATCH + 1 PATCH on
    // the server) and THEN a full pos.fetchData() fan-out (floor + catalog +
    // per-table prefetch) before the UI updated — that was the delay. Now: the
    // optimistic callback fires immediately, the POST persists in the background,
    // and only when it COMMITS do we refresh the floor card (no stale flash).
    onGuestCountSaved?.(count);
    setGuestSaving(true);
    apiFetch('/api/orders/guest-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_number: cart?.table_number, guest_count: count }),
    })
      .then(res => {
        if (res.ok) { onGuestCountPersisted?.(); return; }
        res.json().catch(() => ({}))
          .then(err => toast.error(err?.error || 'Qonaq sayı yenilənə bilmədi', { id: 'guest-count-error' }));
      })
      .catch((e: any) => toast.error(e?.message || 'Qonaq sayı yenilənə bilmədi', { id: 'guest-count-error' }))
      .finally(() => setGuestSaving(false));
    return true;
  }, [cart?.table_number, onGuestCountSaved, onGuestCountPersisted]);

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

  // 2026-09-28 (owner: "eyni mehsul ayri-ayri qeyd olunmali deyil — 1 setire
  // collapse olsun"): PRESENTATION grouping only. The DATA stays per-instance
  // (each line keeps its own modifiers/instance_id/sent state — placeOrder and
  // the per-instance editor target exact line indexes). A group = same
  // product + variant; the row shows Σqty + Σtotal and per-instance details
  // (modifier chips ×N, hold, allergen union, course) live in the sub-row.
  const filteredGroups = useMemo(() => {
    type G = {
      key: string;
      product_id: string;
      product_name: string;
      lines: { item: any; originalIdx: number }[];
      totalQty: number;
      totalAmount: number;
      draftQty: number;      // Σ (quantity − sentQuantity)
      anyHeld: boolean;      // an EDITABLE (unsent portion) instance is on hold
      anyUnsent: boolean;    // an instance with sentQuantity === 0 exists
      modChips: { name: string; count: number }[]; // union across instances
      allergenLabels: string[]; // union across instances (SSOT labels)
      course: string | null;    // shared course (null if lines disagree)
    };
    const groups: G[] = [];
    const map = new Map<string, G>();
    filteredItems.forEach((item: any, idx) => {
      const gk = `${item.product_id}|${item.variant_id ?? ''}`;
      let g = map.get(gk);
      if (!g) {
        g = {
          key: gk, product_id: item.product_id, product_name: item.product_name,
          lines: [], totalQty: 0, totalAmount: 0, draftQty: 0,
          anyHeld: false, anyUnsent: false, modChips: [], allergenLabels: [], course: null,
        };
        g.course = null;
        // First line's course is the candidate for the "shared" chip;
        // recomputed after the loop (must match on EVERY line to show).
        (g as any)._course0 = item.course ?? null;
        map.set(gk, g);
        groups.push(g);
      }
      g.lines.push({ item, originalIdx: idx });
      const sent = item.sentQuantity ?? 0;
      g.totalQty += item.quantity || 0;
      g.totalAmount += (item.unit_price || 0) * (item.quantity || 1);
      g.draftQty += Math.max(0, (item.quantity ?? 0) - sent);
      if (!sent) g.anyUnsent = true;
      if (!sent && (item.is_hold || item.hold_until)) g.anyHeld = true;
      (item.modifiers || []).filter((m: any) => m && m.name).forEach((m: any) => {
        const c = g.modChips.find(x => x.name === m.name);
        if (c) c.count += 1; else g.modChips.push({ name: m.name, count: 1 });
      });
      const al = (item as any).allergens;
      if (Array.isArray(al) && al.length) {
        parseAllergens(al).forEach((a: any) => {
          const lb = resolveAllergenEntry(a)?.label ||
            (a && typeof a === 'object' ? (a.name || a.code || '') : String(a));
          if (lb && !g.allergenLabels.includes(lb)) g.allergenLabels.push(lb);
        });
      }
    });
    // Course: only "shared" when every line carries the SAME non-null value
    // (a mixed group shows no course chip — courses are edited per instance
    // in the modal, where they always were).
    for (const g of groups) {
      const first = (g as any)._course0;
      g.course = first != null && g.lines.every(l => (l.item.course ?? null) === first) ? first : null;
    }
    return groups;
  }, [filteredItems]);

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
    // round 7 #6: Handbag (pickup bag) — consistent with the header switcher
    // and order history (Package read as a box).
    { value: 'takeaway' as const, label: t('takeaway'), icon: Handbag, color: 'amber' },
    { value: 'delivery' as const, label: t('delivery'), icon: Car, color: 'blue' },
  ];
  const activeOrderType = cart?.order_type || 'dine_in';

  /* ─── Global note: pill ↔ card MORPH above the virtual keyboard ───
     2026-09-30 (round 10f, owner: "et" — bring the order note card to the
     same level as the product Qeyd morph, rounds 10c→10e). The old card
     scale-in'd IN PLACE (spring 500/26, bottom = vkHeight+14 state jump) and
     hard-cut away 1 frame after the keyboard collapsed (60fps E2E: the card
     never visited the pill — Δ ≈ 491×340px, pill never hidden). Now it runs
     the SAME one-clock engine as the product morph:
       ENTRY 480ms — the card is born on the pill's rect (z ABOVE the keys)
         and glides up on cubic-bezier(0.32,0.72,0,1); b rides a parallel
         same-duration clock armed the frame the kb mounts; the card LEADS
         the rising kb → zero occlusion by construction.
       EXIT 380ms — the card glides back to the pill's LIVE rect. (The order
         panel drifts only ~31px on the vk collapse and settles by ~180ms —
         well before the 380ms landing — so the live target is already at
         rest on landing: exact, no stale/ghost. Unlike the product modal,
         which is pushed up by the full --vk-height, no var-remainder term.)
         The pill (INLINE opacity 0 while open) is revealed UNDER the
         dissolving card in the last 40% (NOTE_XFADE) → the label arrives
         WITH the shape; the unmount happens while the card is transparent.
       IDLE — b exact at min(pillBottom, kbTop−14); x/w/h/r static.
     autofocus removed (it mounted the VKB in the commit frame — first-paint
     stall, round 10c lesson); focus via the rAF caret effect below. */
  const NOTE_CARD_RADIUS = 28; // rounded-[1.75rem]
  const NOTE_GLIDE = 480;
  const NOTE_RETURN = 380;
  // The order pill rests ~34px BELOW the card's landing point (a longer
  // travel than the product pill) → reveal the pill slightly later so its
  // 120ms global button opacity transition completes under ~transparent card.
  const NOTE_XFADE = 0.6;
  const noteEase = (t: number): number => {
    const p1x = 0.32, p1y = 0.72, p2x = 0, p2y = 1;
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 6; i++) {
      const om = 1 - u;
      const x = 3 * p1x * u * om * om + 3 * p2x * u * u * om + u * u * u - t;
      const dx = 3 * p1x * om * om - 6 * p1x * u * om + 6 * p2x * u * om - 3 * p2x * u * u + 3 * u * u;
      if (Math.abs(dx) < 1e-6) break;
      u = Math.min(1, Math.max(0, u - x / dx));
    }
    const om = 1 - u;
    return 3 * p1y * u * om * om + 3 * p2y * u * u * om + u * u * u;
  };
  type NoteRectT = { x: number; y: number; w: number; h: number; r: number; b: number };
  const notePillRef = useRef<HTMLButtonElement | null>(null);
  const noteCardRef = useRef<HTMLDivElement | null>(null);
  const noteContentRef = useRef<HTMLDivElement | null>(null);
  const noteMorphRef = useRef<{
    raf: number | null; mode: 'open' | 'close' | 'idle' | null;
    t0: number; T: number;
    from: NoteRectT; to: NoteRectT;
    bT0: number;
    lastPill: NoteRectT | null;
  }>({ raf: null, mode: null, t0: 0, T: 0, from: { x: 0, y: 0, w: 0, h: 0, r: 0, b: 0 }, to: { x: 0, y: 0, w: 0, h: 0, r: 0, b: 0 }, bT0: 0, lastPill: null });

  const pillRectLive = (): NoteRectT | null => {
    const el = notePillRef.current;
    if (!el) return null;
    const q = el.getBoundingClientRect();
    return { x: q.x, y: q.y, w: q.width, h: q.height, r: Math.min(q.width, q.height) / 2, b: q.bottom };
  };

  const stepNoteMorph = (now: number) => {
    const m = noteMorphRef.current;
    const card = noteCardRef.current;
    if (!card) { m.raf = null; m.mode = null; return; }
    const pr = pillRectLive();
    if (pr) m.lastPill = pr;
    const lp = m.lastPill!;
    const vw = window.innerWidth, vh = window.innerHeight;
    const kb = document.querySelector('[data-vk-panel]') as HTMLElement | null;
    const kbTop = kb ? kb.getBoundingClientRect().top : null;
    const write = (x: number, w: number, h: number, r: number, b: number) => {
      card.style.left = `${x}px`;
      card.style.top = `${b - h}px`;
      card.style.width = `${w}px`;
      card.style.height = `${h}px`;
      card.style.borderRadius = `${r}px`;
    };
    if (m.mode === 'open') {
      const p = Math.min(1, (now - m.t0) / m.T);
      const e = noteEase(p);
      if (!m.bT0 && kb) {
        m.bT0 = now;
        m.to.b = vh - kb.offsetHeight - 14; // exact rest bottom (kb height constant once mounted)
      }
      let b = m.from.b;
      if (m.bT0) {
        const pb = Math.min(1, (now - m.bT0) / m.T);
        b = m.from.b + (m.to.b - m.from.b) * noteEase(pb);
        if (kbTop != null) b = Math.min(b, kbTop - 14); // occlusion backstop (should never bind — card leads)
      }
      const x = m.from.x + (m.to.x - m.from.x) * e;
      const w = m.from.w + (m.to.w - m.from.w) * e;
      const h = m.from.h + (m.to.h - m.from.h) * e;
      const r = m.from.r + (m.to.r - m.from.r) * e;
      write(x, w, h, r, b);
      if (noteContentRef.current) noteContentRef.current.style.opacity = String(Math.min(1, (now - m.t0) / 160));
      if (p >= 1 && m.bT0 && now - m.bT0 >= m.T) {
        write(m.to.x, m.to.w, m.to.h, m.to.r, m.to.b);
        if (noteContentRef.current) noteContentRef.current.style.opacity = '1';
        m.mode = 'idle';
        m.raf = requestAnimationFrame(stepNoteMorph);
        return;
      }
      m.raf = requestAnimationFrame(stepNoteMorph);
      return;
    }
    if (m.mode === 'close') {
      const p = Math.min(1, (now - m.t0) / m.T);
      const e = noteEase(p);
      // Target = the pill's LIVE rect (see the engine comment above: the
      // panel drift settles by ~180ms, long before the 380ms landing).
      const tx = lp.x, tw = lp.w, th = lp.h, tr = lp.r, tb = lp.b;
      const x = m.from.x + (tx - m.from.x) * e;
      const w = m.from.w + (tw - m.from.w) * e;
      const h = m.from.h + (th - m.from.h) * e;
      const r = m.from.r + (tr - m.from.r) * e;
      const b = m.from.b + (tb - m.from.b) * e;
      write(x, w, h, r, b);
      if (noteContentRef.current) noteContentRef.current.style.opacity = String(Math.max(0, 1 - (now - m.t0) / 140));
      // Identity handoff (round 10e pattern): reveal the pill (inline opacity)
      // UNDER the still-opaque card when the dissolve starts; the card surface
      // fades on the same bezier → the label arrives WITH the shape.
      if (p >= NOTE_XFADE) {
        const f = noteEase((p - NOTE_XFADE) / (1 - NOTE_XFADE));
        card.style.opacity = String(Math.max(0, 1 - f));
        const pill = notePillRef.current;
        if (pill && pill.style.opacity !== '1') pill.style.opacity = '1';
      }
      if (p >= 1) {
        write(tx, tw, th, tr, tb);
        card.style.opacity = '0';
        const pill = notePillRef.current;
        if (pill) pill.style.opacity = '1';
        if (noteContentRef.current) noteContentRef.current.style.opacity = '0';
        m.mode = null;
        m.raf = null;
        setIsNoteOpen(false);
        return;
      }
      m.raf = requestAnimationFrame(stepNoteMorph);
      return;
    }
    // IDLE (settled): b exact at rest; x/w/h/r static (fixed rows=3 textarea).
    const b = kbTop != null ? Math.min(lp.b, kbTop - 14) : lp.b;
    const cw = Math.min(vw * 0.92, 420);
    const x = (vw - cw) / 2;
    m.to = { x, y: b - m.to.h, w: cw, h: m.to.h, r: NOTE_CARD_RADIUS, b };
    write(x, cw, m.to.h, NOTE_CARD_RADIUS, b);
    m.raf = requestAnimationFrame(stepNoteMorph);
  };

  const runNoteMorph = (mode: 'open' | 'close') => {
    const m = noteMorphRef.current;
    if (mode === 'open') {
      if (m.raf == null && m.mode === 'open') {
        m.t0 = performance.now();
        m.raf = requestAnimationFrame(stepNoteMorph);
      }
      return;
    }
    if (m.mode === 'close') return; // re-anchor guard (double-close paths)
    const card = noteCardRef.current;
    const pr = pillRectLive() || m.lastPill;
    if (!card || !pr) return;
    const c = card.getBoundingClientRect();
    if (notePillRef.current) notePillRef.current.style.opacity = '0'; // ghost-free from frame 0
    m.mode = 'close';
    m.t0 = performance.now();
    m.T = NOTE_RETURN;
    m.from = { x: c.x, y: c.y, w: c.width, h: c.height, r: NOTE_CARD_RADIUS, b: c.bottom };
    m.to = { x: pr.x, y: pr.y, w: pr.w, h: pr.h, r: pr.r, b: pr.b }; // refined live in the step
    if (m.raf == null) m.raf = requestAnimationFrame(stepNoteMorph);
  };

  const openNoteEditor = () => {
    if (isNoteOpen) return;
    const p = pillRectLive();
    if (!p) return;
    // Hide the pill with INLINE opacity — the card is born on the pill's
    // exact rect (z above the keys), so the 120ms 1→0 transition runs covered.
    if (notePillRef.current) notePillRef.current.style.opacity = '0';
    loadedNoteRef.current = globalNote;
    const m = noteMorphRef.current;
    const vw = window.innerWidth, vh = window.innerHeight;
    const cw = Math.min(vw * 0.92, 420);
    m.from = p;
    m.to = { x: (vw - cw) / 2, y: 0, w: cw, h: 245, r: NOTE_CARD_RADIUS, b: vh - 14 };
    m.t0 = performance.now();
    m.T = NOTE_GLIDE;
    m.bT0 = 0;
    m.mode = 'open';
    m.lastPill = p;
    setIsNoteOpen(true);
  };

  // Save current note (already persisted live on every keystroke) and close
  // via the EXIT GLIDE (kb collapses in parallel; card rides back to the pill).
  const closeNoteEditor = () => {
    if (!isNoteOpen) return;
    closeVk();
    runNoteMorph('close');
  };

  // GİZLƏ / LƏĞV ET → revert to the value the note had when the editor opened.
  const discardNote = () => {
    if (!isNoteOpen) return;
    setGlobalNote(loadedNoteRef.current);
    onUpdateGlobalNote?.(loadedNoteRef.current);
    closeNoteEditor();
  };

  // Keyboard dismissed via its backdrop / Gizlə key / Escape → close the note
  // too (via the morph, not a hard cut). Only when the keyboard was ALREADY
  // open and just closed, so the opening moment never misfires.
  const vkOpenPrevRef = useRef(vkOpen);
  useEffect(() => {
    const wasOpen = vkOpenPrevRef.current;
    vkOpenPrevRef.current = vkOpen;
    if (wasOpen && !vkOpen && isNoteOpen) closeNoteEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vkOpen, isNoteOpen]);

  // Mount-frame (runs BEFORE paint): measure the content's natural height at
  // final width, paint the card at the pill's snapshot rect, content hidden,
  // then start the open glide. Pre-paint → no flash, no first-frame wobble.
  useLayoutEffect(() => {
    if (!isNoteOpen) return;
    const m = noteMorphRef.current;
    const card = noteCardRef.current;
    if (!card || m.mode !== 'open') return;
    const cw = Math.min(window.innerWidth * 0.92, 420);
    card.style.width = `${cw}px`;
    card.style.height = 'auto';
    m.to.h = noteContentRef.current ? noteContentRef.current.offsetHeight : 245;
    card.style.left = `${m.from.x}px`;
    card.style.top = `${m.from.b - m.from.h}px`;
    card.style.width = `${m.from.w}px`;
    card.style.height = `${m.from.h}px`;
    card.style.borderRadius = `${m.from.r}px`;
    card.style.opacity = '1';
    if (noteContentRef.current) noteContentRef.current.style.opacity = '0';
    runNoteMorph('open');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNoteOpen]);

  // Unmount / teardown safety: the morph loop never outlives the panel.
  useEffect(() => () => {
    const m = noteMorphRef.current;
    if (m.raf != null) { cancelAnimationFrame(m.raf); m.raf = null; m.mode = null; }
  }, []);

  // Focus the textarea on the frame AFTER mount (autoFocus removed — it
  // mounted the whole VKB in the commit frame, stalling first paint, round
  // 10c) + caret at the end on re-open with existing text.
  useEffect(() => {
    if (!isNoteOpen) return;
    const id = requestAnimationFrame(() => {
      const el = noteInputRef.current;
      if (!el) return;
      try { el.focus(); const len = el.value.length; el.setSelectionRange(len, len); } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, [isNoteOpen]);

  useEffect(() => {
    if (numpadOpen) {
      closeVk();
      noteInputRef.current?.blur();
    }
    if (numpadOpen) setVoidMode(false);
  }, [numpadOpen, closeVk]);

  const voidableItems = useMemo(() => {
    if (!cart) return [];
    return cart.items.filter(item => {
      const ks = (item as any).kitchen_status || 'pending';
      return (item.sentQuantity ?? 0) > 0 && ['pending', 'accepted', 'sent', 'preparing'].includes(ks);
    });
  }, [cart]);
  const hasVoidableItems = voidableItems.length > 0;

  // 2026-09-25 (owner): the per-cart status chip was REPLACED by the global
  // MƏTBƏX button in the product filter row (ProductGrid.useKitchenSummary).
  // Same semantics live there: ready / prep (hazırlanır) / draft counts.

  // 2026-09-24 (owner, final decision): the Ləğv pill is VOID-ONLY again
  // (08-26 placement/behavior — untouched). Return is NOT a button anywhere:
  // a TAP ON A SERVED ROW opens the return modal (row-level trigger, see the
  // per-item onClick below). No header space, no row button, no mode.
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
  // (pinGuardOpen state lives with the other useState hooks — top of component.)
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
  // 2026-09-23 (owner): the delivery fee is now BILLED (server adds it to
  // total_amount at creation) — the cart total must show it too, or the
  // displayed total and the receipt total disagree.
  const deliveryFeeTotal = (posMode === 'delivery' && cart.delivery_zone) ? Math.max(0, Number(cart.delivery_fee) || 0) : 0;
  const grandTotal = total + deliveryFeeTotal;

  const cycleCourse = (idx: number) => {
    const item: any = cart?.items[idx];
    if (!item || item.sentQuantity) return;
    const values = COURSES.map(c => c.value);
    const cur = values.includes(item.course) ? item.course : 'main';
    const next = values[(values.indexOf(cur) + 1) % values.length];
    onUpdateItem?.(idx, { course: next } as any);
  };

  /* ═══ HOLD / RESUME — per-INSTANCE state machine (2026-09-28, owner) ═══
     Line states: DRAFT ──hold──► DRAFT_HELD ──resume──► DRAFT ──send──► SENT
     - hold/resume is per line INSTANCE (its own is_hold; identical products
       are separate lines since the auto-merge was removed) — a change on
       one instance never touches the others.
     - modifier / note / course edits are allowed in DRAFT and DRAFT_HELD
       (both are pre-kitchen); they rewrite ONLY this instance (editOf
       lineIndex), so a held instance can be re-specced and still go out
       unchanged-by-others on resume.
     - SENT lines are frozen: hold toggle hidden, stepper blocked, course
       read-only — kitchen changes flow through void/return, not hold.
     - "Send to Kitchen" (placeOrder) sends every line with
       delta = quantity − sentQuantity > 0 AND NOT is_hold, carrying each
       instance's CURRENT modifiers/notes/course/allergens — so resume →
       next send is lossless. All-held cart → "no_new_products" toast.
     - is_hold persists in the draft (localStorage) and, for lines that
       already exist server-side, syncs via /api/orders/item-hold. */
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

   // 2026-09-28 (owner: collapsed rows): the group hold-toggle applies to ALL
   // editable (unsent-portion) instances of the product in ONE batched
   // setCart (onUpdateItems) — sequential onUpdateItem calls would collide on
   // the same stale cart snapshot. Same /api/orders/item-hold sync per sent
   // instance (CSRF-exempt route, same as the single toggleHold above).
   const toggleGroupHold = (group: any) => {
     const editable = group.lines.filter((l: any) => !(l.item.sentQuantity ?? 0) && ((l.item.quantity ?? 0) > 0));
     if (editable.length === 0) return;
     const next = !group.anyHeld;
     onUpdateItems?.(editable.map((l: any) => ({ idx: l.originalIdx, patch: { is_hold: next } as any })));
     editable.forEach((l: any) => {
       if (l.item.id) {
         fetch('/api/orders/item-hold', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ item_id: l.item.id, is_hold: next }),
         }).catch(() => {});
       }
     });
   };

   // Cycle the SHARED course on all unsent instances of the group (only
   // reachable when every line carries the same course — mixed groups have
   // no group chip; per-instance course edits live in the modal).
   const cycleGroupCourse = (group: any) => {
     const values = COURSES.map(c => c.value);
     const cur = values.includes(group.course) ? group.course : 'main';
     const next = values[(values.indexOf(cur) + 1) % values.length];
     const editable = group.lines.filter((l: any) => !(l.item.sentQuantity ?? 0));
     onUpdateItems?.(editable.map((l: any) => ({ idx: l.originalIdx, patch: { course: next } as any })));
   };

  return (
    <>
      {/* 2026-09-26 (owner, Task 50): delivery-fee shimmer (iPhone-call style sweep). */}
      <style>{`
@keyframes vk-fee-shimmer { 0% { transform: translateX(-110%);} 100% { transform: translateX(260%);} }
.vk-fee-shimmer-row { position: relative; display: inline-block; width: 72px; height: 10px; border-radius: 999px; overflow: hidden; background: ${lightMode ? 'rgba(16,165,129,0.12)' : 'rgba(16,185,129,0.14)'}; }
.vk-fee-shimmer-row::after { content: ''; position: absolute; top: 0; bottom: 0; width: 55%; border-radius: 999px; background: linear-gradient(90deg, transparent, ${lightMode ? 'rgba(5,150,105,0.75)' : 'rgba(52,211,153,0.9)'}, transparent); animation: vk-fee-shimmer 1.1s ease-in-out infinite; }
`}</style>
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
                {/* 2026-09-28 (owner: light mode — yalnız mavi/qara) */}
                {seatedNotOrdered && (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-900/10 border border-zinc-900/25 text-zinc-900' : 'bg-orange-500/10 border border-orange-500/30 text-orange-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${lightMode ? 'bg-zinc-900' : 'bg-orange-500'}`} />
                    YENİ OTURUŞ
                  </span>
                )}
                {/* 2026-09-27 (owner, explicit): the dine-in ORD-#### header chip
                    was REMOVED ("ikinci şəkildəki chipi sil"). cart.order_number
                    still lives on the cart (data intact) — it renders in the
                    Tarixçə detail / receipt paths; it is no longer shown here. */}
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
             {/* 2026-09-22 (owner, v2): the customer chip is the ENTRY to the
                 customer phase (CustomerPhasePanel takes the grid's place —
                 the cart column never shrinks). Always rendered for
                 takeaway/delivery: empty = dashed "+ Müşəri", filled =
                 avatar + name + phone. */}
              {(posMode === 'takeaway' || posMode === 'delivery') ? (
                partnerSource ? (
                  /* 2026-09-25 (owner round 6): NOT a bare lock chip — show the
                     FULL partner API payload (name, phone, address, zone,
                     courier, ETA) as a read-only "Partner tətbiqindən (API)"
                     block. Data comes from the order row (API-created);
                     nothing here is an input. */
                  (() => {
                    const po: any = partnerOrder || {};
                    const pName = cart.customer_name || po.customer_name || '—';
                    const pPhone = cart.customer_phone || po.customer_phone || '';
                    const pStreet = po.delivery_street || cart.delivery_street || '';
                    const pBuilding = po.delivery_building || cart.delivery_building || '';
                    const pDistrict = po.delivery_district || cart.delivery_district || '';
                    const pZone = po.delivery_zone || cart.delivery_zone || '';
                    const pAddress = [pStreet, pBuilding, pDistrict].filter(Boolean).join(', ');
                    const pCourier = po.courier_name || '';
                    const pCourierPhone = po.courier_phone || '';
                    const pEta = po.courier_eta || '';
                    return (
                      <div className={`mt-1.5 rounded-2xl border p-3 select-none ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.04] border-white/10'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <PartnerLogo source={partnerSource} height={15} lightMode={lightMode} />
                          <span className={`text-[10px] font-black uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                            Partner tətbiqindən (API)
                          </span>
                          <Lock size={10} className={`ml-auto shrink-0 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`} />
                        </div>
                        <div className={`flex flex-col gap-1 ${lightMode ? 'text-zinc-700' : 'text-white/75'}`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <User size={11} className="shrink-0 opacity-60" />
                            <span className="text-[11px] font-bold truncate">{pName}</span>
                            {pPhone && <span className={`text-[10.5px] font-semibold tabular-nums truncate ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{pPhone}</span>}
                          </div>
                          {pAddress && (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MapPin size={11} className="shrink-0 opacity-60" />
                              <span className="text-[11px] font-semibold truncate">{pAddress}{pZone ? ` · ${pZone}` : ''}</span>
                            </div>
                          )}
                          {pCourier && (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Bike size={11} className="shrink-0 opacity-60" />
                              <span className="text-[11px] font-bold truncate">{pCourier}</span>
                              {pCourierPhone && <span className={`text-[10.5px] font-semibold tabular-nums truncate ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{pCourierPhone}</span>}
                              {pEta && <span className={`text-[10.5px] font-semibold tabular-nums shrink-0 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>· {pEta}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                <button
                  type="button"
                  onClick={() => onOpenCustomerPhase?.()}
                  className={`mt-1.5 flex items-center gap-2 px-2.5 h-8 rounded-full border text-left transition-all active:scale-[0.98] ${
                    cart.customer_name
                      ? (lightMode ? 'bg-blue-50 border-blue-200 hover:bg-blue-100' : 'bg-blue-500/10 border-blue-400/25 hover:bg-blue-500/20')
                      : (lightMode ? 'bg-transparent border-dashed border-zinc-300 hover:border-zinc-400' : 'bg-transparent border-dashed border-white/20 hover:border-white/40')
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${lightMode ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/25 text-blue-300'}`}>
                    {cart.customer_name ? cart.customer_name.slice(0, 1).toUpperCase() : <User size={10} />}
                  </div>
                  <span className={`text-xs font-bold truncate max-w-[150px] ${cart.customer_name ? (lightMode ? 'text-blue-600' : 'text-blue-300') : (lightMode ? 'text-zinc-400' : 'text-white/40')}`}>
                    {cart.customer_name || t('add_customer_phase')}
                  </span>
                  {cart.customer_phone ? <span className={`text-[10px] tabular-nums ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>{cart.customer_phone}</span> : null}
                  <ChevronRight size={11} className={lightMode ? 'text-zinc-300' : 'text-white/25'} />
                </button>
                )
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
                  {customerId && <Star size={11} className={`${lightMode ? 'text-zinc-900' : 'text-amber-400'} shrink-0`} />}
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

       {/* ═══ Cart BODY — STATE MACHINE (2026-09-27 owner: "sebet instant deyisiklik
           gosterir; masa bos olanda button/placeholder desync; state machine ol").
           Before: empty and non-empty were TWO independent branches — the non-empty
           body hard-unmounted (items + Təmizlə/Ləğv row + totals vanished in ONE frame)
           while the empty placeholder faded in over 320ms → a ~320ms BLANK gap.
           Now: ONE AnimatePresence crossfades the two states. The non-empty body is
           in-flow and exits GRACEFULLY (opacity, no snap); the empty placeholder is an
           absolute overlay that fades in on top, so there is never a blank frame.
           Enter = snappy, exit = graceful (~280ms). The Təmizlə/Ləğv morph row lives
           INSIDE the non-empty body, so it fades in/out WITH the items as one unit. */}
       <div className="relative flex-1 min-h-0 overflow-hidden">
         <AnimatePresence initial={false}>
           {!isEmpty && (
             <motion.div
               key="cart-body-items"
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0 }}
               transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
               className="flex flex-col h-full min-h-0"
             >
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

       {/* Cart Quick Actions Row — Təmizlə (clear) + Ləğv et (void) MORPHING.
           (2026-09-27 owner: "'Təmizlə' gedib en yuxarıya düşüb — LƏĞV ET ilə
           EYNI SƏTİRDƏ olmalıdır." This restores the 08-26/09-24 morph that the
           09-27 "header pill" round removed — the design the owner references
           from the earlier commits:
             - NO draft    → Təmizlə collapses (flex 0) → LƏĞV ET = FULL WIDTH
             - draft       → Təmizlə appears on the LEFT, LƏĞV ET takes the
                              right half → one button visibly SPLITS into two
           The row itself still collapses/opens as a STATE TRANSITION (height +
           opacity, 280ms, no snap); the two buttons morph their flex share with
           a spring so the split reads as one continuous morph. Təmizlə clears
           the unsent draft (onClearDraft — first-tap race fixed in usePos). */}
        {/* 2026-09-28 (owner: "Void funksiyasını tapıb bərpa et"): LƏĞV ET is
            ALWAYS present with the cart (never collapses to invisible) — the
            old flex-0 collapse hid the whole feature from all-draft carts,
            which is how the owner lost it. With nothing voidable yet it
            renders as a disabled affordance and explains itself on tap. */}
        <AnimatePresence initial={false}>
          {!isEmpty && (
            <motion.div
              key="quick-actions"
             initial={{ opacity: 0, height: 0, marginBottom: 0 }}
             animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
             exit={{ opacity: 0, height: 0, marginBottom: 0 }}
             transition={{ duration: 0.28, ease: [0.45, 0, 0.55, 1] }}
             className={`border-t overflow-hidden ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}
           >
             <div className="pt-3 pb-4">
               <div className="flex gap-2">
                 <motion.div
                   initial={false}
                   animate={{ flex: hasDraft ? '1 1 0%' : '0 0 0%', opacity: hasDraft ? 1 : 0, scale: hasDraft ? 1 : 0.9 }}
                   transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                   style={{ overflow: 'hidden', minWidth: 0 }}
                 >
                   <button
                     onClick={onClearDraft}
                     title={t('clear')}
                     tabIndex={hasDraft ? 0 : -1}
                     style={{ pointerEvents: hasDraft ? 'auto' : 'none', width: '100%' }}
                     className={`flex items-center justify-center w-full h-full py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.15em] border ${
                       lightMode ? 'bg-white border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                     }`}
                   >
                     <Trash2 size={12} className="mr-1.5" />
                     {t('clear')}
                   </button>
                 </motion.div>
                  <motion.div
                    initial={false}
                    animate={{ flex: '1 1 0%', opacity: hasVoidableItems ? 1 : 0.45, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                    style={{ overflow: 'hidden', minWidth: 0 }}
                  >
                    <button
                      onClick={() => {
                        if (!hasVoidableItems && !voidMode) {
                          // nothing sent to the kitchen yet → explain, don't
                          // open a mode with zero selectable rows.
                          toast(t('hint_void_not_sent') || 'Ləğv üçün əvvəlcə məhsulu mətbəxə göndərin', { id: 'pos-hint', duration: 3500 });
                          return;
                        }
                        if (voidMode) {
                          setVoidMode(false);
                          setVoidSelection({});
                        } else {
                          setVoidMode(true);
                        }
                      }}
                      title={hasVoidableItems ? (t('void_items') || 'Ləğv et') : (t('hint_void_not_sent') || 'Ləğv üçün mətbəxə göndərilmiş məhsul lazımdır')}
                      tabIndex={hasVoidableItems ? 0 : -1}
                      style={{ pointerEvents: 'auto', width: '100%', cursor: hasVoidableItems ? 'pointer' : 'not-allowed' }}
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
           </motion.div>
         )}
       </AnimatePresence>

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
          {/* The app's global CSS kills ALL scrollbars (!important) — the
              overrides below must beat it with class specificity + !important,
              otherwise the 4th+ line stays invisible (QA round 2 FAIL). */}
          <style>{`
            .cart-scroll-thin { scrollbar-width: thin !important; scrollbar-color: rgba(120,120,140,0.45) transparent !important; }
            .cart-scroll-thin::-webkit-scrollbar { width: 6px !important; display: block !important; }
            .cart-scroll-thin::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
            .cart-scroll-thin::-webkit-scrollbar-thumb { background: rgba(120,120,140,0.45) !important; border-radius: 999px; }
            .cart-scroll-thin::-webkit-scrollbar-thumb:hover { background: rgba(120,120,140,0.7) !important; }
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
          {filteredGroups.map((group) => {
            // 2026-09-28 (owner: "eyni mehsul ayri-ayri qeyd olunmali deyil —
            // 1 setire collapse olsun"): ONE presented row per product+variant;
            // the DATA stays per-instance — exact line indexes drive the
            // editor (pill tabs), stepper targets, void selection and hold.
            const lineKeys = group.lines.map((l: any) => l.item.id ?? `idx-${l.originalIdx}`);
            const groupVoidQty = lineKeys.reduce((s, k) => s + (voidSelection[k] || 0), 0);
            const anyVoidSelected = groupVoidQty > 0;
            const voidableLines = group.lines.filter((l: any) =>
              (l.item.sentQuantity ?? 0) > 0 && ['pending', 'accepted', 'sent', 'preparing'].includes(l.item.kitchen_status || 'pending'));
            const groupVoidable = voidableLines.length > 0;
            const anyReturnable = group.lines.some((l: any) =>
              (l.item.sentQuantity ?? 0) > 0 && ['ready', 'completed', 'served'].includes(l.item.kitchen_status || 'pending'));
            const anySent = group.lines.some((l: any) => (l.item.sentQuantity ?? 0) > 0);
            const editableLines = group.lines.filter((l: any) => ((l.item.quantity ?? 0) - (l.item.sentQuantity ?? 0)) > 0);
            const plusTargetIdx = (editableLines[editableLines.length - 1] || group.lines[group.lines.length - 1]).originalIdx;
            const minusTarget = editableLines[editableLines.length - 1] || null;

            // 2026-09-28 (owner P2) + 2026-09-29 (owner, figure 3 — same rule as
            // the modal's Miqdar "+"): STATE-based, not spec-based. A SENT or
            // LOCKED (ready/served/completed) instance is a kitchen snapshot —
            // "+" clones it into a NEW independent line (own modifiers, qty 1,
            // unsent). An UNSENT instance (spec'd or plain) just grows its own
            // qty in place — its modifiers stay on ITS line, siblings untouched.
            const plusTargetItem = group.lines.find((l: any) => l.originalIdx === plusTargetIdx)?.item as any;
            const plusTargetLocked = !!(plusTargetItem && (
              (plusTargetItem.sentQuantity ?? 0) > 0 ||
              ['ready', 'served', 'completed'].includes(plusTargetItem.kitchen_status || '')
            ));
            const plusIsSpecd = !!(plusTargetItem && (
              (plusTargetItem.modifiers?.length > 0) ||
              (plusTargetItem.special_notes || '').trim() ||
              (Array.isArray(plusTargetItem.allergens) && plusTargetItem.allergens.length > 0)
            ));
            const handleGroupPlus = () => {
              if (plusIsSpecd && plusTargetLocked && onCloneInstance) { onCloneInstance(plusTargetIdx); return; }
              onUpdateQty?.(plusTargetIdx, 1);
            };

            const handleGroupMinus = () => {
              if (minusTarget) { onUpdateQty?.(minusTarget.originalIdx, -1); return; }
              if (anyReturnable) toast(t('hint_return_item') || 'Servis edilib — qaytarmaq üçün details panelini açın', { id: 'pos-hint', duration: 3500 });
              else if (anySent) toast(t('hint_void_item') || 'Mətbəxə göndərilib — "Ləğv et" istifadə edin', { id: 'pos-hint', duration: 3500 });
              else toast(t('hint_minus_blocked') || 'Bu məhsulu azaltmaq olmaz — "Ləğv et" istifadə edin', { id: 'pos-hint', duration: 3500 });
            };
            const selectGroupVoid = () => {
              if (!groupVoidable) return;
              setVoidSelection(prev => {
                if (anyVoidSelected) {
                  const n = { ...prev };
                  lineKeys.forEach(k => delete n[k]);
                  return n;
                }
                // Single active GROUP (old: single active line) — wholesale
                // replace keeps exactly this group's voidable instances.
                const n: Record<string, number> = {};
                voidableLines.forEach((l: any) => {
                  n[l.item.id ?? `idx-${l.originalIdx}`] = l.item.sentQuantity || l.item.quantity || 1;
                });
                return n;
              });
            };

            return (
              <motion.div
                key={group.key}
                layout={!voidMode}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.26, ease: [0.45, 0, 0.55, 1] } }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                data-cart-item
                onClick={() => {
                  // Row is PASSIVE (return lives in the details panel); in
                  // void mode a non-voidable group explains why it's inert.
                  if (voidMode && !groupVoidable) {
                    if (anyReturnable) {
                      toast(t('hint_void_not_ready') || 'Servis olunub — ləğv etmək olmaz; details panelində "Geri qaytar" var', { id: 'pos-hint', duration: 3500 });
                    } else if (anySent) {
                      toast(t('hint_void_not_sent') || 'Mətbəxə göndərilməyib — "Ləğv et" ilə ləğv edin', { id: 'pos-hint', duration: 3500 });
                    }
                  }
                }}
                  className={`relative mb-2 overflow-hidden rounded-2xl border bg-[var(--theme-surface-muted)] shadow-[0_1px_3px_rgba(255,255,255,0.04)] px-3.5 py-3 transition-[border-color,box-shadow] duration-300 ${voidMode && groupVoidable && anyVoidSelected
                    ? (lightMode ? 'bg-rose-50/70 border-rose-300' : 'bg-rose-500/10 border-rose-400/50')
                    : voidMode && !groupVoidable && !anyReturnable
                      ? 'opacity-50 border-[var(--theme-border)]'
                      : 'border-[var(--theme-border)]'}`}
              >
                 {/* Void selection lines — rose (void color), and they now
                     FADE OUT on "−" (AnimatePresence exit) instead of
                     vanishing instantly. */}
                  <AnimatePresence initial={false}>
                    {voidMode && groupVoidable && anyVoidSelected && (
                     <motion.div
                       key="void-lines"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.32, ease: [0.45, 0, 0.55, 1] } }}
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
                       <p className="text-sm font-semibold truncate text-[var(--theme-text)] flex items-center gap-1.5">
                         {group.product_name}
                         {/* 2026-09-28 (owner, REJECTED the "SƏRV" badge): the
                             served-state chip stays REMOVED. The served state is
                             still expressed by the read-only course chip + the
                             details-panel "Geri qaytar" action (anyReturnable
                             above keeps working for the void-mode hint). */}
                       </p>
                       <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {/* 2026-09-29 (owner, figure 4: "hər şey yazılıb —
                              bir cümlə olsun"): the UNION modifier chip LIST
                              (Kremli ×2 · Acılı Mayonez ×2 · …) is replaced
                              by ONE compact summary chip "⚙ N əlavə" — the
                              full list stays in the hover tooltip, and WHICH
                              instance carries WHAT lives in the editor's pill
                              tabs. Row stays one line, no chip sprawl. */}
                          {group.modChips.length > 0 && (
                            <span
                              title={group.modChips.map((c: any) => `${c.name}${c.count > 1 ? ` ×${c.count}` : ''}`).join(' · ')}
                              className="inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-0.5 rounded-md bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[10px] font-semibold tracking-normal text-[var(--theme-text-secondary)]"
                            >
                              <SlidersHorizontal size={10} />{group.modChips.reduce((s: number, c: any) => s + (c.count || 1), 0)} əlavə
                            </span>
                          )}
                         {/* Course chip — only when EVERY instance shares the
                             same course (mixed groups are edited per instance
                             in the modal, where they always were). Tap cycles
                             all unsent instances of the group. */}
                         {group.course && (
                           group.draftQty > 0 ? (
                             <button
                               onClick={(e) => { e.stopPropagation(); cycleGroupCourse(group); }}
                               className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold tracking-normal transition-all active:scale-95 ${COURSE_STYLE[group.course] || COURSE_STYLE.main}`}
                               title="Xidmət ardıcıllığı (dəyişmək üçün toxun)"
                             >
                               {COURSE_LABEL[group.course] || group.course}
                             </button>
                           ) : (
                             <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold tracking-normal opacity-80 ${COURSE_STYLE[group.course] || COURSE_STYLE.main}`}>
                               {COURSE_LABEL[group.course] || group.course}
                             </span>
                           )
                         )}
                          {/* 2026-09-29 (owner, figure 5: "hold/resume çox yer
                              tutur, animasiya yoxdur, transition yoxdur — ən
                              yaxşısını düşün"): the text chip "Saxlanılıb" is
                              now an ICON-ONLY pause badge (20px) that SPRING-
                              POPS in/out (AnimatePresence, micro) — the held
                              state reads at a glance, costs ~zero row space,
                              and its appearance/disappearance IS the
                              state-machine transition. Tap = RESUME all held
                              instances (same machine as the per-line badge). */}
                          <AnimatePresence initial={false}>
                            {group.anyHeld && (
                              <motion.button
                                key="held-badge"
                                initial={{ scale: 0.4, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.12 } }}
                                transition={SPRING}
                                onClick={(e) => { e.stopPropagation(); toggleGroupHold(group); }}
                                title="Saxlanılıb — toxunub bərpa et"
                                className={`inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-md border active:scale-90 ${lightMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-orange-500/10 border-orange-500/25 text-orange-400'}`}
                              ><Pause size={10} strokeWidth={2.5} /></motion.button>
                            )}
                          </AnimatePresence>
                        {/* Allergen union across the group (SSOT labels —
                            2026-09-28: raw codes like "fish" are resolved to
                            "Balıq" through the allergen SSOT). */}
                          {group.allergenLabels.length > 0 && (
                            /* 2026-09-29 (owner, figure 4): compact ONE-LINE
                               allergen badge — first label + "+N" (full list in
                               the tooltip). Safety info stays VISIBLE, but it
                               no longer sprawls across two lines. */
                            <span className="inline-flex items-center gap-0.5 whitespace-nowrap px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-[10px] font-semibold tracking-normal text-red-600 dark:text-red-300/90"
                              title={group.allergenLabels.join(' · ')}>
                              <AlertTriangle size={9} />{group.allergenLabels[0]}{group.allergenLabels.length > 1 ? ` +${group.allergenLabels.length - 1}` : ''}
                            </span>
                          )}
                      </div>
                   </div>
                    <span className={`text-sm font-black tabular-nums min-w-[4rem] text-right ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                      {group.totalAmount.toFixed(2)} ₼
                    </span>
                      {voidMode && groupVoidable ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center rounded-xl border border-[var(--theme-border)] overflow-hidden">
                             <motion.button
                               onClick={(e) => { e.stopPropagation(); selectGroupVoid(); }}
                               whileTap={{ scale: 0.88 }} transition={TAP}
                               className="w-10 h-10 flex items-center justify-center text-lg font-black hover:bg-[var(--theme-surface-soft)] disabled:opacity-30"
                               disabled={!anyVoidSelected}
                             >−</motion.button>
                             <span className="w-10 h-10 flex items-center justify-center text-sm font-black tabular-nums text-[var(--theme-text)]">{groupVoidQty || '—'}</span>
                             <motion.button
                              onClick={(e) => { e.stopPropagation(); selectGroupVoid(); }}
                              whileTap={{ scale: 0.88 }} transition={TAP}
                              className="w-10 h-10 flex items-center justify-center text-lg font-black hover:bg-[var(--theme-surface-soft)]"
                               >+</motion.button>
                          </div>
                        </div>
                      ) : (
                     <div className="flex items-center gap-2">
                       <div className="flex items-center rounded-xl border border-[var(--theme-border)] overflow-hidden">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleGroupMinus(); }}
                           aria-disabled={group.draftQty <= 0}
                           className={`w-11 h-11 flex items-center justify-center text-lg font-black transition-colors active:scale-95 ${group.draftQty <= 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}
                          >−</button>
                          <span className="w-12 h-11 flex items-center justify-center text-sm font-black tabular-nums">{group.totalQty}</span>
                          <motion.button
                            whileTap={{ scale: 0.95, transition: { type: 'spring', stiffness: 400, damping: 35, mass: 0.4 } }}
                            onClick={(e) => { e.stopPropagation(); handleGroupPlus(); }}
                            className="w-11 h-11 flex items-center justify-center text-lg font-black hover:bg-white/10 transition-colors active:scale-95"
                          >+</motion.button>
                     </div>
                    {/* QA bug 14 (2026-09-22): all line action buttons now share
                        the stepper's 44px box (h-11 w-11) — the old p-2 icon
                        buttons were ~32px and sat off-axis with the +/− column. */}
                      {group.anyUnsent && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleGroupHold(group); }}
                         className={`w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 ${group.anyHeld
                           ? (lightMode ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100' : 'bg-orange-500/10 border-orange-500/25 text-orange-600 dark:text-orange-300/80 hover:bg-orange-500/20')
                           : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}
                         title={group.anyHeld ? 'Bərpa et' : 'Saxla (mətbəxə göndərmə)'}
                       >
                         {group.anyHeld ? <Play size={16} /> : <Pause size={16} />}
                       </button>
                     )}
                      <button onClick={(e) => { e.stopPropagation(); onRequestEditor?.(group.product_id, group.lines.map((l: any) => l.originalIdx), group.lines.map((l: any) => l.item)); }} className={`w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`} title={t('details')}>
                        <SlidersHorizontal size={16} />
                      </button>
                      {/* 2026-09-24 (owner, FINAL): no per-row button at all —
                          return lives in the details panel (served lines).
                          Void (Ləğv pill + mode) and Təmizlə keep their
                          08-26 placement, untouched. */}
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
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.26, ease: [0.45, 0, 0.55, 1] } }}
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
                    {t('void_mode_explanation') || 'Ləğv etmək istədiyiniz məhsulu \"+\" ilə seçin'}
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
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.26, ease: [0.45, 0, 0.55, 1] } }}
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
                  {/* VAT — 2026-09-27 (owner): only when the global EDV switch
                      is ON; the line was rendered (hardcoded 18%) even with
                      VAT disabled in Settings. */}
                  {vatEnabled && (
                  <div className="flex items-center justify-between">
                     <span className="text-xs uppercase tracking-widest font-medium text-[var(--theme-text-secondary)]">{t('vat')}</span>
                       <NumberRoll value={vatAmount} prefix="" suffix=" ₼" decimals={2} className="text-xs font-medium tabular-nums text-[var(--theme-text-secondary)]" />
                  </div>
                  )}
                 {/* Delivery fee (2026-09-23: now charged — shows the amount
                     or the free state from zone threshold / campaign) */}
                  {posMode === 'delivery' && cart.delivery_zone && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-widest font-medium text-[var(--theme-text-secondary)]">{t('delivery_fee') || 'Çatdırılma'}</span>
                      {feeCalculating ? (
                        <span className="vk-fee-shimmer-row" />
                      ) : deliveryFeeTotal > 0 ? (
                        <NumberRoll value={deliveryFeeTotal} prefix="" suffix=" ₼" decimals={2} className="text-xs font-medium tabular-nums text-[var(--theme-text-secondary)]" />
                      ) : (
                        <span className="text-xs font-black text-emerald-500">{t('free') || 'Pulsuz'}</span>
                      )}
                    </div>
                  )}
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
                ref={notePillRef}
                onClick={openNoteEditor}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-colors ${isNoteOpen ? 'pointer-events-none' : ''} ${
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
       </motion.div>
           )}
           {isEmpty && (
             <motion.div
               key="cart-body-empty"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               transition={{ duration: 0.28, ease: [0.45, 0, 0.55, 1] }}
               className="absolute inset-0 flex flex-col items-center justify-center text-[var(--theme-text-muted)]"
             >
               <ShoppingBag size={56} className="mb-4 opacity-15" />
               <p className="text-sm font-black uppercase tracking-widest mb-1">{t('no_products')}</p>
               <p className="text-xs mb-6 opacity-60">{t('add_items_hint')}</p>
             </motion.div>
           )}
         </AnimatePresence>
       </div>

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

      {/* 2026-09-27 (owner: "qeyd pill-i sexy yuxarı açılsın, eyni animasiya
          çıxış, klaviye avtomatik açılsın və bağlansa") — 2026-09-30 (round
          10f): the scale-in-in-place motion.div (spring 500/26, bottom state
          jump, 1-frame hard cut on close) is replaced by the ONE-CLOCK pill↔
          card morph — the same engine as the product Qeyd (rounds 10c→10e):
          born on the pill's rect, glides up above the keys (z-10003), rides
          back to the pill with an identity cross-fade (NOTE_XFADE). The
          card geometry is driven ENTIRELY by the rAF loop (left/top/w/h/r);
          it lives OUTSIDE AnimatePresence (the backdrop fades independently —
          the round-10c "AnimatePresence hostage" bug). */}
      {createPortal(
        <>
          <AnimatePresence>
            {isNoteOpen && (
              <motion.div
                key="note-backdrop"
                className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9998]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
                onClick={closeNoteEditor}
              />
            )}
          </AnimatePresence>
          {isNoteOpen && (
            <div
              ref={noteCardRef}
              className={`fixed z-[10003] overflow-hidden border shadow-elevated backdrop-blur-xl ${lightMode ? 'bg-white/95 border-zinc-200' : 'bg-[#1D1D24]/97 border-white/12'}`}
              style={{ left: -9999, top: -9999, width: 0, height: 0, borderRadius: NOTE_CARD_RADIUS, willChange: 'left, top, width, height' }}
            >
              <style>{`.cart-note-ta.vk-active{box-shadow:none!important}`}</style>
              <div ref={noteContentRef} className="flex flex-col" style={{ opacity: 0 }}>
              {/* header */}
              <div className={`flex items-center gap-2 px-4 pt-3.5 pb-2 border-b ${lightMode ? 'border-zinc-100' : 'border-white/8'}`}>
                <span className={`w-7 h-7 rounded-xl flex items-center justify-center ${lightMode ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/12 text-emerald-400'}`}>
                  <Tag size={13} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-700' : 'text-white/85'}`}>Sifariş qeydi</p>
                  <p className={`text-[9px] font-semibold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>kitchen + receipt-ə düşür</p>
                </div>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={closeNoteEditor}
                  aria-label="Bağla"
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${lightMode ? 'text-zinc-400 hover:bg-zinc-100' : 'text-white/40 hover:bg-white/10'}`}
                >
                  <X size={14} />
                </button>
              </div>
              {/* body */}
              <div className="p-4 pt-3">
                <textarea
                  ref={noteInputRef}
                  value={globalNote}
                  onChange={e => { setGlobalNote(e.target.value); onUpdateGlobalNote?.(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeNoteEditor(); } if (e.key === 'Escape') { e.preventDefault(); closeNoteEditor(); } }}
                  placeholder={t('note_placeholder') || 'Qeyd yaz...'}
                  rows={3}
                  className={`cart-note-ta w-full text-[15px] leading-relaxed p-3.5 rounded-2xl border-2 focus:outline-none resize-none transition-colors ${lightMode ? 'bg-zinc-50 text-gray-900 border-zinc-200 focus:border-emerald-400 placeholder:text-zinc-400' : 'bg-[#15151A] text-white border-white/10 focus:border-emerald-400/70 placeholder:text-white/25'}`}
                />
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={discardNote}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/8 text-white/60 hover:bg-white/15'}`}
                  >
                    Ləğv et
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={closeNoteEditor}
                    className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-500 text-[#04211a] hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-colors"
                  >
                    Təsdiqlə
                  </button>
                </div>
              </div>
              </div>
            </div>
          )}
        </>,
        document.body
      )}

    </motion.div>

    {/* 2026-09-24 (owner, FINAL): ReturnItemModal removed from here — the
        return flow now lives inside the details panel (ProductGrid morph). */}

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
