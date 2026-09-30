'use client';

import { useState, useMemo, useEffect, useLayoutEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Plus, Clock, Star, Heart, ShoppingCart, Ban, PackageOpen, AlertTriangle, RefreshCw, Pause, Check, RotateCcw, Package, Trash2, ArrowLeft, Flame, Lock, Tag } from '@/components/ui/saito-icons';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { PinGuard } from './PinGuard';
import { LiquidCategoryNavbar } from './LiquidCategoryNavbar';
import type { PosProduct, PosModifierSelection } from '../types/shared';
import { playHapticSound } from '@/lib/haptic';
import { appleBackdrop } from '@/lib/modal-transitions';
import { parseAllergens, resolveAllergenEntry, ALLERGEN_FALLBACK_ICON } from '@/lib/allergens';
import { useVirtualKeyboard } from './VirtualKeyboard';

// Shared springs — single source lives in ../lib/pos-motion so every POS
// component (navbars, sheets, cart) imports the SAME feel. Re-exported here
// for existing importers.
export { SPRING, TAP } from '../lib/pos-motion';
import { SPRING, TAP } from '../lib/pos-motion';

// 2026-09-25 (owner): canonical return reasons. The codes match the DB-side
// enum used by record_item_waste (customer_return, kitchen_error, burned,
// spilled, wrong_item, expired, spoilage, other) and are stored verbatim in
// log_audit/inventory_logs for the statistics page.
const RETURN_REASONS: { code: string; az: string; en: string; ru: string }[] = [
  { code: 'customer_return', az: 'Müştəri qaytarır', en: 'Customer return', ru: 'Возврат клиентом' },
  { code: 'kitchen_error', az: 'Mətbəx xətası', en: 'Kitchen error', ru: 'Ошибка кухни' },
  { code: 'wrong_item', az: 'Yanlış məhsul', en: 'Wrong item', ru: 'Неверное блюдо' },
  { code: 'burned', az: 'Yanmış', en: 'Burned', ru: 'Сгорело' },
  { code: 'spilled', az: 'Dökülüb', en: 'Spilled', ru: 'Разлито' },
  { code: 'expired', az: 'Sürəti keçib', en: 'Expired', ru: 'Срок вышел' },
  { code: 'spoilage', az: 'Bozulub', en: 'Spoiled', ru: 'Испортилось' },
  { code: 'other', az: 'Digər', en: 'Other', ru: 'Другое' },
];

export type Product = PosProduct;

export interface EditorPreset {
  variantId?: string | null;
  note?: string;
  modifiers?: Record<string, number>;
  quantity?: number;
  identity?: string;
  // State that must survive a modal re-open (was lost: "hold/resume ve course
  // send to kitchen etdikden sonra itir"):
  course?: string | null;
  is_hold?: boolean;
  // Allergens flagged on this line (customer allergy → kitchen warning),
  // persisted to order_items.allergens (jsonb).
  allergens?: string[];
  // Exact cart line being edited (stable replace target — owner fix 2026-09-21:
  // config edits must update THAT line even when it's already sent).
  lineIndex?: number;
  // 2026-09-24 (owner, FINAL): when the line being edited is SERVED, the
  // details panel shows a right-side "Geri qaytar" button that MORPHS the
  // panel into the return view (PIN → qty → Anbara qaytar / İtkiyə yaz).
  returnCtx?: {
    order_item_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  };
  // 2026-09-28 (owner: "Məhsul 'Served' statusuna keçdikdən sonra onun
  // modifikatorları dəyişdirilə bilməməlidir"): the edited line's kitchen
  // status. served/completed → spec fields locked (read-only editor).
  kitchen_status?: string | null;
  // 2026-09-28 (owner: "modifikator interfeysində instansiyalar arasında
  // keçid üçün tablar əlavə et" + "tiktokdaki kimi surusdurme pilli"): the
  // editor opens in MULTI-INSTANCE mode when the collapsed cart row carries
  // several instances of the same product+variant — one pill tab per
  // instance (hint = the exclusive-group choice or first modifier name:
  // "1 · Kremli" / "2 · Yüngül"), and the CTA saves ALL instances atomically
  // (onApplyInstanceEdits → usePos.applyInstanceEdits, single setCart).
  instances?: {
    lineIndex: number;
    quantity: number;
    modifiers: Record<string, number>;
    variantId: string | null;
    note: string;
    course: string | null;
    is_hold: boolean;
    allergens: string[];
    kitchen_status: string | null;
    sentQuantity: number;
    returnCtx?: {
      order_item_id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
    };
    hint: string;
  }[];
}

export interface ProductGridRef {
  openEditor: (productId: string, preset?: EditorPreset) => void;
  toggleEditor: (productId: string, preset?: EditorPreset) => void;
}

interface ProductGridProps {
  products: PosProduct[];
  combos?: any[];
  categories: { id: string; name: string }[];
  /** Son/Məşur tab data (server-computed; favorites live in localStorage). */
  filterData?: { recent: { id: string; name: string }[]; popular: { id: string; name: string; qty: number }[] } | null;
  // 2026-09-27 (owner): the MƏTBƏX popup also shows the CURRENT table's state.
  currentTableKitchen?: { label: string; draft: number; prep: number; ready: number } | null;
  // 11n (owner): the DEFAULT serving course from Settings → Mətbəx. New items
  // show it pre-selected in the Mərhələ pills and are saved with it.
  defaultCourse?: string;
  onAddProduct: (product: PosProduct) => void;
  /** 2026-09-28 (owner: pill tabs): atomic multi-instance save — replaces
      several exact cart lines in ONE setCart (usePos.applyInstanceEdits). */
  onApplyInstanceEdits?: (product: PosProduct, edits: {
    lineIndex: number;
    quantity: number;
    variantId: string | null;
    notes: string;
    modifiers: PosModifierSelection[];
    course: string | null;
    isHold: boolean;
    allergens: string[];
  }[]) => void;
  onAddCombo?: (combo: any) => void;
  cartCounts: Record<string, number>;
  // 2026-09-30 (owner, round 8b): LIVE qty binding. `cartItemQtys` = the
  // current cart lines' quantities (index-aligned; the page memoizes it) —
  // the editor follows external changes while open. `onLiveQtyChange` =
  // the editor's report of a stepper change; the page applies it to that
  // cart line with the line's OWN spec (qty-only → no spurious P1 sync).
  cartItemQtys?: number[];
  onLiveQtyChange?: (lineIndex: number, quantity: number) => void;
  outOfStock?: Set<string>;
  variantsByProduct?: Record<string, any[]>;
  // G8 Batch 3: catalog load error + retry (parent owns catalog fetching).
  catalogError?: boolean;
  onRetryCatalog?: () => void;
}

const COMBO_TAB = '__combos__';

// "Sevimli" (favorites) tab REMOVED by owner request (2026-09-21): redundant
// with Məşur (popular) — same role. Card heart buttons removed with it.
const FILTER_TABS = [
  { id: 'all' as const, labelKey: 'all_products', icon: Search },
  { id: 'recent' as const, labelKey: 'recent', icon: Clock },
  { id: 'popular' as const, labelKey: 'popular', icon: Star },
];

// 2026-09-27 (owner): the GLOBAL kitchen summary (all open orders) is REMOVED
// from the MƏTBƏX pill/popover — "bütün sifarişləri göstərməməlidir. Yalnız
// seçilmiş masanın mətbəx statusunu göstərsin". The pill + popover now read
// the `currentTableKitchen` prop (the selected table's own cart lines).
// This also kills a 5s RPC poll that ran even when the popover was closed.

type GridItem = PosProduct & { _isCombo?: boolean; _raw?: any; variants?: any[]; modifiers?: any[]; modifier_groups?: any[] };

function AllergenBadges({ item }: { item: GridItem | undefined; lightMode?: boolean }) {
  const list = item ? parseAllergens(item.allergens) : [];
  if (list.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {list.slice(0, 6).map((a: any, i) => {
        const def = resolveAllergenEntry(a);
        const Icon = def?.icon ?? ALLERGEN_FALLBACK_ICON;
        const label = typeof a === 'object' ? (a.name || def?.label || a.code) : String(a);
        return (
          <span key={i} title={label} className="leading-none cursor-default select-none opacity-70">
            <Icon size={13} strokeWidth={2.2} />
          </span>
        );
      })}
    </div>
  );
}

export const ProductGrid = forwardRef<ProductGridRef, ProductGridProps>(function ProductGrid({
  products, combos, categories, onAddProduct, onApplyInstanceEdits, onAddCombo, cartCounts, cartItemQtys, onLiveQtyChange, outOfStock, variantsByProduct,
  catalogError, onRetryCatalog, filterData, currentTableKitchen, defaultCourse = 'main'
}, ref) {
  const { language, t } = useLanguage();
  const { lightMode } = useTheme();
  // Yellow #2: when the on-screen keyboard is open, pad the grid's scroll
  // container so bottom fields/cards are never hidden under it.
  const { height: vkHeight, close: closeVk, isOpen: vkOpen } = useVirtualKeyboard();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // 2026-09-27 (owner: OOS kartların "yanıb-sönməsi"): a failed image is marked
  // failed IMMEDIATELY — the old `?t=Date.now()` re-fetch swapped the src
  // mid-frame and the card flashed (img → blank → img). A fresh catalog load
  // (60s auto-sync) resets the set so every URL gets one clean chance.
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  useEffect(() => { setFailedImages(new Set()); }, [products]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'recent' | 'popular'>('all');
  // 2026-09-27 (owner): MƏTBƏX button + hint now reflect the SELECTED TABLE
  // only (the currentTableKitchen prop), not all open orders.
  const [kitchenHintOpen, setKitchenHintOpen] = useState(false);
  // 2026-09-26: the hint is rendered as a FIXED-position panel anchored to the
  // button's rect. It used to be `absolute` inside the filter row, but that row
  // is `overflow-x-auto` → the browser clipped the dropdown (present in DOM /
  // ARIA, invisible in pixels). Fixed positioning escapes the scroll container.
  const kitchenBtnRef = useRef<HTMLButtonElement>(null);
  const [kitchenHintPos, setKitchenHintPos] = useState<{ top: number; left: number } | null>(null);
  // 2026-09-27 (owner): pill highlight + badge = the SELECTED TABLE's active
  // kitchen load (draft excluded — unsent lines aren't in the kitchen yet).
  const tkCount = currentTableKitchen ? currentTableKitchen.ready + currentTableKitchen.prep : 0;
  const tkActive = tkCount > 0;
  // The hint is a glanceable popover — auto-close after 8s so a stray open
  // can never leave the full-screen click-away backdrop up over the POS.
  useEffect(() => {
    if (!kitchenHintOpen) return;
    const t = window.setTimeout(() => setKitchenHintOpen(false), 8000);
    return () => window.clearTimeout(t);
  }, [kitchenHintOpen]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined);
  const [noteForProduct, setNoteForProduct] = useState<string>('');
  // Course + hold of the line being edited (restored on re-open — were lost).
  const [editCourse, setEditCourse] = useState<string | null>(null);
  const [editIsHold, setEditIsHold] = useState(false);
  // Selected allergens (customer allergy flags) for the open product modal.
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, number>>({});
  const [pulseMap, setPulseMap] = useState<Record<string, number>>({});
  const [bounceMap, setBounceMap] = useState<Record<string, number>>({});

  // 2026-09-24 (owner, FINAL): the details panel MORPHS into the return view
  // when the edited line is served. Flow: right-side "Geri qaytar" → PinGuard
  // → morph (edit content slides out, return content slides in, same card) →
  // qty + Anbara qaytar / İtkiyə yaz. The standalone ReturnItemModal and the
  // row-tap return are gone.
  const [returnCtx, setReturnCtx] = useState<NonNullable<EditorPreset['returnCtx']> | null>(null);
  // Served/completed line → spec LOCKED (qty/variant/modifiers/course/note/
  // allergens read-only). The GERİ QAYTAR (return) flow stays available —
  // returning a served dish is a refund/waste path, not a spec change.
  // 2026-09-28: renamed singleLocked — in MULTI-INSTANCE mode the lock is
  // DERIVED from the ACTIVE pill's kitchen state (each instance can be in a
  // different state: one served, the other still draft).
  const [singleLocked, setSingleLocked] = useState(false);
  // 2026-09-28 (owner P2): single-mode kitchen status of the edited line —
  // drives the READY/SERVED lock label (multi mode reads the active pill's).
  const [editKs, setEditKs] = useState<string | null>(null);
  // 2026-09-28 (owner: "eyni mehsul 1 setire collapse olsun + modifikator
  // acanda tiktokdaki kimi surusdurme pilli"): multi-instance drafts.
  // instList = the original preset data (static per open — the pills render
  // from it); instDraftsRef = the EDITABLE drafts, committed on every tab
  // switch and at save; activeInst = the visible pill (its draft drives all
  // the field states below).
  const [instList, setInstList] = useState<NonNullable<EditorPreset['instances']>>([]);
  const [activeInst, setActiveInst] = useState(0);
  const instDraftsRef = useRef<NonNullable<EditorPreset['instances']>>([]);
  // 2026-09-29 (owner, figure 1: "1-den 2-yə keçəndə state-machine transition
  // olsun" + "daha touch-friendly"): the sliding capsule indicator. layoutId
  // morphs are unreliable inside the scaled modal (framer projection vs.
  // transform), so the indicator is a MEASURED absolute element: on every
  // activeInst change we read the pill's offsetLeft/offsetWidth and spring the
  // capsule there — a deterministic state-to-state morph (Philosophy §2/§5).
  const multiInst = instList.length > 0;
  const instPillRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pillInd, setPillInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    if (!multiInst || instList.length === 0) { setPillInd(null); return; }
    const el = instPillRefs.current[Math.min(activeInst, instList.length - 1)];
    if (!el) return;
    setPillInd((prev) => (prev && prev.x === el.offsetLeft && prev.w === el.offsetWidth ? prev : { x: el.offsetLeft, w: el.offsetWidth }));
    // round 9 fix: also re-measure when the ACTIVE pill's spec label changes —
    // the label is resolveHintName() of selectedModifiers, so changing the
    // SERVİŇƏ ÜSLUBU / modifier changes the pill width WITHOUT instList
    // changing; without this the capsule keeps its old (narrower) width and the
    // new label is clipped (owner: "active pill texti tam tutmur, yarimciq qalir").
  }, [multiInst, activeInst, instList, selectedModifiers]);
  const activeDraft = multiInst ? instList[Math.min(activeInst, instList.length - 1)] : null;
  // 2026-09-30 (owner, round 9 — "YADDA SAXLA · 8"): the CTA shows the TOTAL
  // UNIT count across all instances (2+2+4 = 8), NOT the instance count (3).
  // Live: the active pill contributes the stepper's current qty.
  const multiTotalUnits = multiInst
    ? instList.reduce((s, d: any, i: number) => s + (i === activeInst ? Math.max(1, qty) : (d.quantity || 1)), 0)
    : 0;
  // 2026-09-28 (owner P2: "Servis edilmiş və ya 'Ready'/hazır instansiyanın
  // modifikatoru artıq dəyişdirilməməlidir"): READY joins the locked set —
  // the dish is out the pass, its spec is frozen PER INSTANCE (a sibling
  // still in the kitchen / draft stays editable).
  const LOCKED_KS = ['ready', 'served', 'completed'];
  const specLocked = multiInst
    ? !!activeDraft && LOCKED_KS.includes(activeDraft.kitchen_status || '')
    : singleLocked;
  const lockStatus = multiInst ? (activeDraft?.kitchen_status || '') : (editKs || '');
  const lockLabel = lockStatus === 'ready' ? 'Hazır (READY)' : 'Served';
  const [returnView, setReturnView] = useState(false);
  const [returnPinOpen, setReturnPinOpen] = useState(false);
  const [returnQty, setReturnQty] = useState(1);
  const [returnLoading, setReturnLoading] = useState(false);
  // 2026-09-25 (owner): MANDATORY return reason — persisted to the DB
  // (log_audit / inventory_logs) and later used by the statistics page.
  const [returnReason, setReturnReason] = useState('');
  const [returnReasonText, setReturnReasonText] = useState('');
  // 2026-09-30 (owner, round 10 → 10c): the modal's Qeyd is a ROUNDED PILL
  // (the cart's "Qeyd əlavə et" reference) that morph-opens a FLOATING editor
  // above the virtual keyboard (owner: "pill itmədən hərəkət edib mərkəzdə
  // açılan popup olsun, klaviaturanın üzərində"). Round 10/10b did this with
  // framer layoutId ("prod-qeyd-pill") — the 60fps E2E frame trace (fx-e*/fx-x*)
  // proved TWO-BEAT BUGS on both directions:
  //   ENTRY: ~120ms freeze → the card inflated in place at the pill's LOW y
  //     (TƏSDİQLƏ occluded by the rising keyboard) → then a SEPARATE ~270px
  //     upward glide when the vkHeight state finally landed (plus a
  //     non-uniform scale squash mid-flight).
  //   EXIT: layoutId RE-MEASURES the pill AFTER the keyboard's --vk-height
  //     push collapsed and the modal drifted back down ~140px — the morph
  //     target was STALE: the card cross-faded to nothing mid-flight while
  //     the real pill popped in 140px lower (ghost/double element).
  // ROOT CAUSE: layoutId resolves against the LIVE layout, and that layout is
  // MOVING during both transitions (the VKB's @property --vk-height push).
  // FIX (round 10c): no layoutId at all — a MANUAL rAF spring (semi-implicit
  // Euler per axis, K=520/C=44 ≈ critical, the same stiffness as the old
  // layout spring) that TRACKS A LIVE TARGET every frame:
  //   ENTRY: snapshot the pill's rect on tap → spring the card (x/y/w/h/r)
  //     toward the final card rect whose bottom rides the LIVE --vk-height
  //     (getComputedStyle on the REGISTERED custom property returns the value
  //     mid-transition, so the card lifts with the keyboard as ONE body —
  //     one continuous glide, no inflate-then-slide, no occlusion).
  //   EXIT: spring toward the pill's LIVE getBoundingClientRect — the pill
  //     stays mounted (opacity 0) and MOVES as the keyboard collapses, and
  //     the card follows it frame by frame (no stale target, no cross-fade,
  //     no ghost). The card unmounts only on landing, when it IS the pill's
  //     rect — the handoff to the revealed pill is invisible.
  const NOTE_CARD_RADIUS = 24; // rounded-3xl
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const noteEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const notePillRef = useRef<HTMLButtonElement | null>(null);
  const noteCardRef = useRef<HTMLDivElement | null>(null);
  const noteContentRef = useRef<HTMLDivElement | null>(null);
  type NoteRectT = { x: number; y: number; w: number; h: number; r: number; b: number };
  const noteMorphRef = useRef<{
    raf: number | null; mode: 'open' | 'close' | 'idle' | null;
    t0: number; T: number;
    from: NoteRectT; to: NoteRectT;
    bT0: number;            // entry: the b-axis clock arms on the frame the KB mounts
    idleH0: number; idleHT0: number;  // idle: the h micro-ease (textarea auto-grow)
    lastPill: NoteRectT | null;
  }>({ raf: null, mode: null, t0: 0, T: 0, from: { x: 0, y: 0, w: 0, h: 0, r: 0, b: 0 }, to: { x: 0, y: 0, w: 0, h: 0, r: 0, b: 0 }, bT0: 0, idleH0: 0, idleHT0: 0, lastPill: null });

  // ── Round 10d — "one clock" morph (the iOS Search-or-Ask reference feel) ──
  // Owner: "buna bax, çox smooth edir — bizdə isə yerine gedəndə cisis
  // animasiyası berbatdır, yerine oturması... bizdə o deyil, niyə?"
  // Frame analysis of the reference (ref-frames/*): the smoothness is NOT a
  // better spring — it is a MOTION STRUCTURE:
  //   1. The element that travels FAR is the keyboard itself (a full-width
  //      sheet on one tuned spring). The bar only materializes at the top.
  //   2. Every actor shares ONE CLOCK — they start together and land
  //      together; nothing chases anything.
  //   3. The motion is TIME-CONSTRAINED: a decelerating curve with ZERO
  //      final velocity (bezier ease-out) — it ENDS. A free spring has an
  //      asymptotic tail (the "cisis"/floaty settle the owner saw in 10c).
  // 10c's card did the long ~155-270px travel itself on a free K=520/C=44
  //  spring (asymptotic tail) + a min() handoff kick when the keyboard edge
  //  caught up + a content fade that lagged the geometry. All of that is
  //  replaced by ONE time-constrained glide per direction:
  //   ENTRY (480ms ≈ the keyboard's own settle): the card LEAVES THE PILL ON
  //     FRAME 1 (committed fast start, v₀ ≈ 700px/s) and decelerates into
  //     the final rect — x/w/h/r on one bezier(0.32,0.72,0,1) clock; b on a
  //     parallel same-duration clock that arms the frame the keyboard mounts
  //     (focus lands 1 frame after the click). The card LEADS the rising
  //     keyboard at every instant (verified: at t=250ms card bottom 611 vs
  //     keyboard top 658 — the card is already above the keys) → zero
  //     occlusion without any constraint; a min() backstop stays as insurance.
  //     The 14px gap eases open at the end as the keyboard creeps the last
  //     few px — everything LANDS ON THE SAME CLOCK, like the reference.
  //   EXIT (380ms — slightly quicker, a collecting motion): the card glides
  //     back to the pill's REST rect = (pill live rect + live --vk-height
  //     remainder). That sum is a CONSTANT (the pill's var=0 position) even
  //     while the keyboard collapses — so the target is static: the pill
  //     arrives by ~180ms, the card by 380ms and lands ON it exactly. No
  //     chase, no stale target, no ghost, no tail — the glide ENDS.
  //   IDLE: b stays exact (min(pillBottom, kbTop−14)); h micro-eases (120ms
  //     bezier) when the textarea auto-grows — no spring, no drift.
  const NOTE_GLIDE = 480;
  const NOTE_RETURN = 380;
  // Round 10e — exit cross-fade window: the card's surface dissolves over the
  // LAST 45% of the return glide (by p=0.55 the shape is already ~97% of the
  // pill's size) while the pill is revealed UNDER it — the label arrives WITH
  // the shape (owner: "yerine oturanda pill-dəki yazı görünmür, sanki pill
  // olur sonradan dönür"). See stepNoteMorph close branch.
  const NOTE_XFADE = 0.55;
  // cubic-bezier(0.32, 0.72, 0, 1) — fast committed start (slope 2.25), long
  // decelerating settle, EXACTLY zero velocity at t=1 (the smooth "oturması").
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
  const readVkVar = () => {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vk-height'));
    return Number.isFinite(v) ? v : 0;
  };
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
      // b-axis: its own same-duration clock, armed the frame the keyboard
      // exists (focus mounts it 1 frame after the click). Before that the
      // card grows in place — the motion reads as one continuous gesture.
      if (!m.bT0 && kb) {
        m.bT0 = now;
        m.to.b = vh - kb.offsetHeight - 14; // exact rest bottom (kb height is constant once mounted)
      }
      let b = m.from.b;
      if (m.bT0) {
        const pb = Math.min(1, (now - m.bT0) / m.T);
        b = m.from.b + (m.to.b - m.from.b) * noteEase(pb);
        if (kbTop != null) b = Math.min(b, kbTop - 14); // occlusion backstop (should never bind)
      }
      const x = m.from.x + (m.to.x - m.from.x) * e;
      const w = m.from.w + (m.to.w - m.from.w) * e;
      const h = m.from.h + (m.to.h - m.from.h) * e;
      const r = m.from.r + (m.to.r - m.from.r) * e;
      write(x, w, h, r, b);
      // Content fades EARLY and fast — the card and its content arrive as
      // ONE object (10c's late fade made the card look empty while drifting).
      if (noteContentRef.current) noteContentRef.current.style.opacity = String(Math.min(1, (now - m.t0) / 160));
      if (p >= 1 && m.bT0 && now - m.bT0 >= m.T) {
        // Landed exactly on the clock — no tail, no gate, no lingering.
        write(m.to.x, m.to.w, m.to.h, m.to.r, m.to.b);
        if (noteContentRef.current) noteContentRef.current.style.opacity = '1';
        m.mode = 'idle';
        m.idleH0 = m.to.h; m.idleHT0 = now;
        m.raf = requestAnimationFrame(stepNoteMorph);
        return;
      }
      m.raf = requestAnimationFrame(stepNoteMorph);
      return;
    }
    if (m.mode === 'close') {
      const p = Math.min(1, (now - m.t0) / m.T);
      const e = noteEase(p);
      // Target = the pill's REST rect: pill live + the live --vk-height
      // remainder. That sum is the pill's var=0 position — a CONSTANT during
      // the collapse (self-correcting if a resize/scroll happens mid-flight).
      const vl = readVkVar();
      const tx = lp.x, tw = lp.w, th = lp.h, tr = lp.r, tb = lp.b + vl;
      const x = m.from.x + (tx - m.from.x) * e;
      const w = m.from.w + (tw - m.from.w) * e;
      const h = m.from.h + (th - m.from.h) * e;
      const r = m.from.r + (tr - m.from.r) * e;
      const b = m.from.b + (tb - m.from.b) * e;
      write(x, w, h, r, b);
      if (noteContentRef.current) noteContentRef.current.style.opacity = String(Math.max(0, 1 - (now - m.t0) / 140));
      // 2026-09-30 (round 10e — IDENTITY HANDOFF, owner: "yerine oturanda
      // qerbielik var, pill-dəki yazı görünmür, öz forması/ölçüsü deyil kimi"):
      // ROOT CAUSE found by 60fps E2E: the global rule
      // `button:disabled { opacity: .4 }` (globals.css:322, specificity 0-1-1)
      // OVERRODE the class `opacity-0` (0-1-0) for the whole time the pill
      // was disabled-open → a 40% GHOST pill sat at the pill spot under the
      // backdrop, and on landing the `disabled` release ran the global
      // `transition: opacity .12s` (globals.css:319) → the label faded
      // 0.4 → 1.0 AFTER the card unmounted (measured 0.4 → 0.713 → 1.0 over
      // ~135ms) = "the text arrives late / the shape isn't the pill's own".
      // FIX: the pill is hidden with INLINE opacity 0 (inline beats any
      // stylesheet rule). When the card starts dissolving (last 45% of the
      // glide — the shape is already within ~3% of the pill), the pill is
      // revealed UNDER the still-opaque card (its own 120ms 0→1 transition
      // runs fully covered) and the card surface fades out on the same
      // bezier. The label therefore "arrives with" the shape, and the
      // unmount happens while the card is already transparent → no empty
      // landing, no ghost, no late fade, no pop.
      if (p >= NOTE_XFADE) {
        const f = noteEase((p - NOTE_XFADE) / (1 - NOTE_XFADE));
        card.style.opacity = String(Math.max(0, 1 - f));
        const pill = notePillRef.current;
        if (pill && pill.style.opacity !== '1') pill.style.opacity = '1';
      }
      if (p >= 1) {
        // Land EXACTLY on the pill's rest rect: the card is already fully
        // transparent (f=1) and the pill already opaque — unmount + state
        // flip paint the pill in place, label included: invisible handoff.
        write(tx, tw, th, tr, tb);
        card.style.opacity = '0';
        const pill = notePillRef.current;
        if (pill) pill.style.opacity = '1';
        if (noteContentRef.current) noteContentRef.current.style.opacity = '0';
        m.mode = null;
        m.raf = null;
        setNoteEditorOpen(false);
        return;
      }
      m.raf = requestAnimationFrame(stepNoteMorph);
      return;
    }
    // IDLE (settled): b exact at rest; h micro-eases toward the content's
    // live natural height (textarea auto-grow); x/w/r snap (resize only).
    const pBottom = lp.b;
    const b = kbTop != null ? Math.min(pBottom, kbTop - 14) : pBottom;
    const cw = Math.min(vw * 0.92, 420);
    const natH = noteContentRef.current ? noteContentRef.current.offsetHeight : m.to.h;
    if (Math.abs(natH - m.to.h) > 0.5 && now - m.idleHT0 > 60) {
      m.idleH0 = m.to.h; m.idleHT0 = now;
    }
    const ph = Math.min(1, (now - m.idleHT0) / 120);
    const h = m.idleH0 + (natH - m.idleH0) * noteEase(ph);
    const x = (vw - cw) / 2;
    m.to = { x, y: b - h, w: cw, h, r: NOTE_CARD_RADIUS, b };
    write(x, cw, h, NOTE_CARD_RADIUS, b);
    m.raf = requestAnimationFrame(stepNoteMorph);
  };

  const runNoteMorph = (mode: 'open' | 'close') => {
    const m = noteMorphRef.current;
    if (mode === 'open') {
      // open is seeded in openNoteEditor (the click); the loop starts from
      // the mount-frame layoutEffect (the card must exist to be measured).
      if (m.raf == null && m.mode === 'open') {
        m.t0 = performance.now();
        m.raf = requestAnimationFrame(stepNoteMorph);
      }
      return;
    }
    // close: re-anchor a NEW glide from the card's CURRENT on-screen rect to
    // the pill's rest rect. Works from any mode (mid-entry-glide, idle) —
    // the position is continuous (same rect), only the curve restarts.
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
    const p = pillRectLive();
    if (!p) return;
    // Round 10e: hide the pill with INLINE opacity — the class `opacity-0`
    // is overridden while open by the global `button:disabled { opacity:.4 }`
    // rule (the pill is disabled-open) → a 40% ghost. Inline beats it. The
    // card is born on the pill's exact rect, so the 120ms 1→0 transition
    // runs fully covered by the card.
    if (notePillRef.current) notePillRef.current.style.opacity = '0';
    const m = noteMorphRef.current;
    const vw = window.innerWidth, vh = window.innerHeight;
    const cw = Math.min(vw * 0.92, 420);
    m.from = p;
    // to.h is measured at final width in the mount-frame layoutEffect;
    // to.b is armed on the first step frame where the keyboard exists.
    m.to = { x: (vw - cw) / 2, y: 0, w: cw, h: 177, r: NOTE_CARD_RADIUS, b: vh - 14 };
    m.t0 = performance.now();
    m.T = NOTE_GLIDE;
    m.bT0 = 0;
    m.mode = 'open';
    m.lastPill = p;
    setNoteEditorOpen(true);
  };

  const closeNoteEditor = () => {
    if (!noteEditorOpen) return;
    commitInstanceDraft(); // persist the active instance's note into its draft
    // 2026-09-30 (round 10b — "klaviye gec bağlanır"): explicit closeVk() runs
    // the keyboard exit IN PARALLEL with the card's exit morph (the blur-only
    // path hit the VKB's control-tap guard and waited for the 300ms detached
    // poll — a 360–450ms dead gap). Round 10c: that parallel --vk-height
    // collapse is exactly what the exit tracks — the card follows the pill's
    // live rect down as the modal settles.
    closeVk();
    runNoteMorph('close');
  };

  // Mount-frame (runs BEFORE paint): measure the content's natural height at
  // FINAL width (fixing the entry's h target for the whole glide), paint the
  // card at the pill's snapshot rect, content hidden, then start the open
  // glide. Pre-paint → no flash, no freeze, no first-frame wobble.
  useLayoutEffect(() => {
    if (!noteEditorOpen) return;
    const m = noteMorphRef.current;
    const card = noteCardRef.current;
    if (!card || m.mode !== 'open') return;
    const cw = Math.min(window.innerWidth * 0.92, 420);
    card.style.width = `${cw}px`;
    card.style.height = 'auto';
    m.to.h = noteContentRef.current ? noteContentRef.current.offsetHeight : 177;
    // Paint the FROM (pill snapshot) rect — the glide starts from here.
    card.style.left = `${m.from.x}px`;
    card.style.top = `${m.from.b - m.from.h}px`;
    card.style.width = `${m.from.w}px`;
    card.style.height = `${m.from.h}px`;
    card.style.borderRadius = `${m.from.r}px`;
    if (noteContentRef.current) noteContentRef.current.style.opacity = '0';
    runNoteMorph('open');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteEditorOpen]);

  // Unmount / modal-teardown safety: the morph loop never outlives the grid
  // (an orphaned rAF writing into a dead portal would be the old "stranded
  // card" bug in a different costume).
  useEffect(() => () => {
    const m = noteMorphRef.current;
    if (m.raf != null) { cancelAnimationFrame(m.raf); m.raf = null; m.mode = null; }
  }, []);

  // VKB dismissed from the OUTSIDE (✓ done key / GİZLƏ / outside tap) while
  // the card is open → close the card too, or it strands (E2E bug #1/#2/#7).
  // Edge-detected (wasOpen && !vkOpen) so the opening moment (keyboard not
  // mounted yet) never misfires — mirrors the cart's vkOpenPrevRef pattern.
  const vkOpenPrevRef = useRef(vkOpen);
  useEffect(() => {
    const wasOpen = vkOpenPrevRef.current;
    vkOpenPrevRef.current = vkOpen;
    if (wasOpen && !vkOpen && noteEditorOpen) closeNoteEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vkOpen, noteEditorOpen]);
  // E2E bug #3: autoFocus left the caret at INDEX 0 on a re-opened editor with
  // existing text — the first VKB character PREPENDED ("x" + "Bu məhsul…").
  // Force the caret to the end after mount. (The autofocus itself also opens
  // the VKB in PARALLEL with the entry spring — the card rides its rise.)
  useEffect(() => {
    if (!noteEditorOpen) return;
    const id = requestAnimationFrame(() => {
      const el = noteEditorRef.current;
      if (!el) return;
      try { el.focus(); const len = el.value.length; el.setSelectionRange(len, len); } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, [noteEditorOpen]);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const expandedIdRef = useRef<string | null>(null);
  const presetRef = useRef<EditorPreset | null>(null);
  // Aktiv sessiyanın redaktə identikliyi — handleModalAdd üçün (preset
  // one-shot consumed olduqdan sonra da əlçatan olmalıdır).
  const editIdentityRef = useRef<string | null>(null);
  // Exact cart line being edited (kept in its own ref: presetRef is nulled
  // one-shot on open, so reading it at save-time would be undefined).
  const editLineIndexRef = useRef<number | null>(null);

  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  // 2026-09-28 (owner: pill tabs): the shared field states (qty/variant/
  // modifiers/note/course/hold/allergens/returnCtx) are the view of the
  // ACTIVE instance — load ONE draft into them. NOTE: no house-default
  // preselect here (single mode keeps it) — a stored line's exact spec is
  // the truth, and silently adding a default member would change its price
  // on save.
  const loadInstanceFields = (idx: number, drafts: NonNullable<EditorPreset['instances']>) => {
    const d = drafts[idx];
    if (!d) return;
    setQty(d.quantity && d.quantity > 0 ? d.quantity : 1);
    setSelectedVariant(d.variantId ?? undefined);
    setNoteForProduct(d.note || '');
    setEditCourse(d.course ?? null);
    setEditIsHold(!!d.is_hold);
    setSelectedAllergens(d.allergens || []);
    setReturnCtx(d.returnCtx ?? null);
    setSelectedModifiers({ ...(d.modifiers || {}) });
  };
  // 2026-09-30 (owner, round 9): resolve the ACTIVE pill's spec to a short
  // readable label for the pill ("Kremli" / "Yüngül" / "Standart"), so a
  // freshly-created "＋ Yeni variant" pill shows its spec NAME, not a raw id.
  // Prefers an exclusive (max_select=1) group's choice (e.g. SERVİŇƏ ÜSLUBU),
  // else the first selected modifier name, else null (no spec → the pill shows
  // only its ×qty badge).
  const resolveHintName = (mods?: Record<string, number>): string | null => {
    const groups: any[] = (expandedItem as any)?.modifier_groups || [];
    const modList: any[] = (expandedItem as any)?.modifiers || [];
    const selMods = mods ?? selectedModifiers;
    const sel = Object.keys(selMods || {}).filter((id) => (selMods as any)[id] > 0);
    const nameOf = (id: string) => modList.find((m: any) => m.id === id)?.name || null;
    if (sel.length) {
      let base: string | null = null;
      let baseId: string | null = null;
      for (const g of groups) {
        if (Number(g?.max_select) === 1) {
          const hit = (g?.item_ids || []).find((id: string) => sel.includes(id));
          if (hit) { base = nameOf(hit); baseId = hit; break; }
        }
      }
      if (!base) {
        for (const id of sel) { const n = nameOf(id); if (n) { base = n; baseId = id; break; } }
      }
      // 2026-09-30 (round 9b, E2E legibility catch): two specs sharing the same
      // SERVİŇƏ ÜSLUBU ("Standart" vs "Standart + Avokado") used to render the
      // IDENTICAL pill label. Append the count of EXTRA selected modifiers
      // (addons beyond the base name) — "Standart +1" disambiguates compactly.
      const extra = sel.reduce((s, id) => (id !== baseId ? s + ((selMods as any)[id] || 1) : s), 0);
      return base ? (extra > 0 ? `${base} +${extra}` : base) : null;
    }
    // 2026-09-30 (owner, round 9b — "default pill shows no label"): a line
    // with NO explicit exclusive choice (legacy plain lines saved before
    // round 9b prefill) still shows the group's house default name
    // ("Standart") — an unchosen exclusive group IS the standard serving.
    for (const g of groups) {
      if (Number(g?.max_select) === 1 && Array.isArray(g?.item_ids) && g.item_ids.length > 0) {
        const items = modList.filter((m: any) => g.item_ids.includes(m.id));
        const def = items.find((m: any) => m.is_default) || items.find((m: any) => !Number(m.price));
        if (def) return def.name || null;
      }
    }
    return null;
  };

  // 2026-09-30 (owner, round 9 fix): the "＋ Yeni variant" pill starts as a FRESH
  // DEFAULT spec — the exclusive group's default option (e.g. Standart) + the
  // default variant, NO additive modifiers — NOT a clone of the active pill. The
  // owner found the clone confusing ("yeni spec yaradanda copy edir"). Mirrors
  // the openEditor preselect logic.
  const freshDefaultSpec = (): { variantId: string | null; modifiers: Record<string, number> } => {
    const groups: any[] = (expandedItem as any)?.modifier_groups || [];
    const mods: any[] = (expandedItem as any)?.modifiers || [];
    const sel: Record<string, number> = {};
    for (const g of groups) {
      if (Number(g?.max_select) === 1 && Array.isArray(g?.item_ids) && g.item_ids.length > 0) {
        const items = mods.filter((m: any) => g.item_ids.includes(m.id));
        const def = items.find((m: any) => m.is_default) || items.find((m: any) => !Number(m.price));
        if (def) sel[def.id] = 1;
      }
    }
    const variants: any[] = (expandedItem as any)?.variants || [];
    const defVariant = variants.find((v: any) => v.is_default) || (variants.length === 1 ? variants[0] : null);
    return { variantId: defVariant?.id ?? null, modifiers: sel };
  };

  // Commit the ACTIVE field states back into its draft (mutates the ref —
  // the pills render from the static instList, so no state write needed).
  const commitInstanceDraft = () => {
    const drafts = instDraftsRef.current;
    const idx = Math.min(activeInst, drafts.length - 1);
    if (!drafts[idx]) return;
    drafts[idx] = {
      ...drafts[idx],
      quantity: qty,
      variantId: selectedVariant ?? null,
      note: noteForProduct,
      course: editCourse,
      is_hold: editIsHold,
      allergens: selectedAllergens,
      modifiers: { ...selectedModifiers },
      // round 9: keep a live spec label so the pill shows the readable name.
      hint: resolveHintName() || drafts[idx].hint || '',
    };
  };
  // TikTok-style tab switch: commit current → activate target → load it.
  const switchInstance = (next: number) => {
    if (next === activeInst || next < 0 || next >= instDraftsRef.current.length) return;
    commitInstanceDraft();
    setActiveInst(next);
    setReturnView(false); // a return in progress belongs to the previous pill
    loadInstanceFields(next, instDraftsRef.current);
  };

  // 2026-09-30 (owner, round 9 — "YOL 1: + Yeni Variant"): explicitly create a
  // NEW instance (a new spec tab) of the current product by cloning the ACTIVE
  // instance's spec into a fresh `__isNew` draft. This is the ONLY way to make
  // multiple instances: round-9 A removed auto-split on plain taps (identical
  // specs now MERGE), so a distinct variant is an intentional "new variant"
  // action, not a side effect of tapping. The new pill is a local draft —
  // YADDA SAXLA commits it as a fresh cart line (applyInstanceEdits __isNew
  // path). Owner workflow: 2× Kremli → "+ Yeni variant" → 2× Yüngül →
  // "+ Yeni variant" → 4× Standart = 3 pills, save "· 8".
  const addNewInstance = () => {
    // 11n (owner: "eyni məhsuldan yenisi əlavə ediləndə eyni və ya fərqli
    // modifier əlavə etmək mümkün olmalıdır"): adding a NEW portion is allowed
    // even when the ACTIVE instance is SERVED/READY-locked — the new draft is
    // a fresh, unsent line with its own spec. (The guard used to block this
    // whole flow: a served product was a dead end.)
    if (!expandedItem) return;
    commitInstanceDraft();
    const drafts: any[] = instDraftsRef.current;
    // Seed a base draft if we're currently in single-instance mode (no pills).
    if (drafts.length === 0) {
      // 11n: carry the single-mode line's kitchen_status into the seeded base
      // draft — without it a SERVED line's pill would render UNLOCKED in the
      // new multi-strip (the lock is derived per pill from kitchen_status).
      drafts.push({
        lineIndex: editLineIndexRef.current ?? -1,
        __isNew: editLineIndexRef.current == null,
        quantity: qty,
        variantId: selectedVariant ?? null,
        note: noteForProduct || '',
        modifiers: { ...selectedModifiers },
        course: editCourse,
        is_hold: editIsHold,
        allergens: selectedAllergens,
        kitchen_status: editKs || undefined,
        hint: resolveHintName() || '',
        unitPrice: modalUnitPrice,
      });
    }
    // round 9 fix: FRESH DEFAULT spec — NOT a clone of the active pill (owner:
    // "yeni spec yaradanda copy edir"). Starts as the default variant + the
    // exclusive group's default option (e.g. Standart), no additive modifiers.
    const fresh = freshDefaultSpec();
    drafts.push({
      lineIndex: -1,
      __isNew: true,
      quantity: 1,
      variantId: fresh.variantId,
      note: '',
      modifiers: { ...fresh.modifiers },
      course: null,
      is_hold: false,
      allergens: [],
      hint: resolveHintName(fresh.modifiers) || '',
      unitPrice: modalUnitPrice,
    });
    setInstList([...drafts]);
    setActiveInst(drafts.length - 1);
    setQty(1);
    // reset the shared field states to the fresh default (the new pill is active)
    setSelectedVariant(fresh.variantId ?? undefined);
    setSelectedModifiers({ ...fresh.modifiers });
    setNoteForProduct('');
    setEditCourse(null);
    setEditIsHold(false);
    setSelectedAllergens([]);
  };

  // 2026-09-30 (owner, round 9 fix — "＋ basdıqsa onu silmək olmur"): remove an
  // instance pill. __isNew (unsaved) drafts are dropped locally. Existing cart
  // lines are removed via onApplyInstanceEdits (qty 0, sentQty-clamped) and the
  // remaining drafts' lineIndex are re-indexed (a removed line shifts the cart
  // down by one, so any draft whose lineIndex was past it must decrement).
  // Served/locked instances can't be removed from here (use GERİ QAYTAR).
  const removeInstance = (i: number) => {
    const drafts: any[] = instDraftsRef.current;
    const d = drafts[i];
    if (!d) return;
    if (d.kitchen_status && LOCKED_KS.includes(d.kitchen_status)) return;
    // 2026-09-30 (owner, round 9c): a line with ALREADY-SENT units (sentQty>0,
    // status 'sent'/'preparing') can't be pulled from the modal — applyInstance
    // Edits clamps to the sent portion, so removing the pill locally would
    // desync pill↔cart (the line would reappear on reopen). Returns go through
    // GERİ QAYTAR. Fresh (__isNew) and fully-unsent lines are unaffected.
    const sent = Number(d.sentQuantity) || 0;
    if (!d.__isNew && d.lineIndex >= 0 && sent > 0) {
      toast.error('Bu sətirdə mətbəxə göndərilmiş hissə var — əvvəl GERİ QAYTAR edin');
      return;
    }
    commitInstanceDraft();
    const removedLineIndex: number = d.lineIndex;
    const isLocal = d.__isNew || removedLineIndex < 0;
    if (!isLocal && onApplyInstanceEdits) {
      // 2026-09-30 (owner, round 9c — "× basmaq olmur"): ROOT CAUSE of a DEAD
      // delete button. The draft stores modifiers as a Record {id: qty}, but
      // applyInstanceEdits expects PosModifierSelection[] and does
      // `nextMods.map` — passing the Record threw `TypeError: nextMods.map is
      // not a function` on EVERY saved-line removal (silence in the UI — the
      // pill just stayed). Convert to the selection array (name/price from the
      // product's modifier list) before handing off.
      const modDefs: any[] = (expandedItem as any)?.modifiers || [];
      const modsArr = Object.entries(d.modifiers || {})
        .filter(([, q]) => Number(q) > 0)
        .map(([id, q]) => {
          const def = modDefs.find((m: any) => m.id === id);
          return { id, name: def?.name || id, price: Number(def?.price) || 0, quantity: Number(q) || 1 };
        });
      onApplyInstanceEdits(expandedItem as any, [{
        lineIndex: removedLineIndex,
        quantity: 0,
        variantId: d.variantId ?? null,
        notes: d.note || '',
        modifiers: modsArr,
        course: d.course ?? null,
        isHold: !!d.is_hold,
        allergens: d.allergens ?? [],
      }] as any);
    }
    const next = drafts
      .filter((_, idx) => idx !== i)
      .map((dd: any) => (!isLocal && dd.lineIndex > removedLineIndex ? { ...dd, lineIndex: dd.lineIndex - 1 } : dd));
    instDraftsRef.current = next;
    setInstList(next);
    const len = next.length;
    if (len > 0) {
      const ni = Math.max(0, Math.min(activeInst > i ? activeInst - 1 : activeInst, len - 1));
      setActiveInst(ni);
      loadInstanceFields(ni, next);
    } else {
      setActiveInst(0);
    }
  };

   // 2026-09-28 (owner P2: "say artıranda modifikatorlar bütün instansiyalar
   // üçün birləşir") → round 6: STATE-BASED unsent-grows/sent-clones →
   // 2026-09-30 (owner, round 8: "modal içi say artırmak işləmir — bu button
   // bunu özün test et"): the CLONE path was the bug's twin — on a SENT
   // instance the modal "+" spawned a NEW pill instead of growing the number
   // (owner: "3-cü avtomatik yarandı"). The rule is now SIMPLE and matches
   // the stepper's meaning in BOTH modes:
   //   • MODAL stepper "+" = ALWAYS grow the ACTIVE instance's total qty
   //     (even on a sent instance: the already-sent portion is never touched —
   //     applyInstanceEdits clamps `newQty = max(e.quantity, sentQty)` and the
   //     UNSENT delta goes out on the next send, kitchen ticket appended).
   //   • CART-ROW "+" = "one more of this product" → clone an independent
   //     instance (round-5 P2 "qty+ = müstəqil instansiya") — that rule lives
   //     in CartPanel.handleGroupPlus, NOT here.
   // Each instance keeps its own modifier set either way.
   // 2026-09-30 (owner, round 8b: "səbətdeki sayı artıranla modal içi say
   // artırma sync işləsin"): LIVE two-way quantity binding.
   //   MODAL → CART: every +/− reports `onLiveQtyChange(lineIndex, newQty)`;
   //   the PAGE applies it to the cart line with the LINE'S OWN current spec
   //   (qty-only diff → P1 kitchen spec-sync does NOT fire; the sent portion
   //   is clamped by applyInstanceEdits `newQty = max(qty, sentQty)`; the
   //   unsent delta goes out on the next MƏTBƏXƏ GÖNDƏR). So the cart stepper
   //   and the modal stepper are always the SAME number — no "save to sync".
   //   CART → MODAL: the `cartItemQtys` sync effect below follows external
   //   cart changes while the editor is open. Loop-safe: our own push writes
   //   the SAME value into the cart, so the effect only fires on external
   //   changes (cart +, group +, void, kitchen).
   const liveQtyPush = (lineIndex: number | null | undefined, newQty: number) => {
     if (lineIndex == null || lineIndex < 0) return; // new product / new instance — nothing to push yet
     onLiveQtyChange?.(lineIndex, Math.max(1, newQty));
   };
   const handleQtyPlus = () => {
     if (!multiInst) {
       const nq = qty + 1;
       setQty(nq);
       liveQtyPush(editLineIndexRef.current, nq);
       return;
     }
     commitInstanceDraft();
     const drafts = instDraftsRef.current;
     const idx = Math.min(activeInst, drafts.length - 1);
     const nq = qty + 1;
     if (drafts[idx]) { drafts[idx] = { ...drafts[idx], quantity: nq }; setInstList([...drafts]); }
     setQty(nq);
     liveQtyPush(drafts[idx]?.lineIndex, nq);
   };
   const handleQtyMinus = () => {
     const nq = Math.max(1, qty - 1);
     setQty(nq);
     if (!multiInst) { liveQtyPush(editLineIndexRef.current, nq); return; }
     const drafts = instDraftsRef.current;
     const idx = Math.min(activeInst, drafts.length - 1);
     if (drafts[idx]) { drafts[idx] = { ...drafts[idx], quantity: nq }; setInstList([...drafts]); }
     liveQtyPush(drafts[idx]?.lineIndex, nq);
   };

  useEffect(() => {
    if (!expandedId) {
      presetRef.current = null;
      editIdentityRef.current = null;
      editLineIndexRef.current = null;
      setReturnCtx(null);
      setReturnView(false);
      // 2026-09-30 (round 10c): kill the morph loop first — the card and the
      // pill both die with the modal, so no orphaned rAF / stranded portal.
      const nm = noteMorphRef.current;
      if (nm.raf != null) { cancelAnimationFrame(nm.raf); nm.raf = null; nm.mode = null; }
      setNoteEditorOpen(false); // the floating Qeyd editor dies with the modal
      setSingleLocked(false);
      setEditKs(null);
      // Multi-instance drafts die with the modal — the next open must start
      // from a fresh preset, never from the previous product's drafts.
      instDraftsRef.current = [];
      setInstList([]);
      setActiveInst(0);
      return;
    }
    // One-shot: preset yalnız bir dəfə tətbiq olunur, sonra təmizlənir ki,
    // növbəti kart toxunuşunda köhnə preset təsadüfən tətbiq olunmasın.
    const preset = presetRef.current;
    presetRef.current = null;
    // 2026-09-28 (owner: "instansiyalar arasında keçid üçün tablar əlavə et"):
    // MULTI-INSTANCE mode — the collapsed cart row carries several instances
    // of the same product+variant; each gets its own pill tab.
    if (preset?.instances && preset.instances.length > 0) {
      const drafts = preset.instances.map(i => ({
        ...i,
        modifiers: { ...(i.modifiers || {}) },
        allergens: [...(i.allergens || [])],
      }));
      instDraftsRef.current = drafts;
      setInstList(drafts);
      setActiveInst(0);
      editIdentityRef.current = null;
      editLineIndexRef.current = null;
      setReturnView(false);
      setSingleLocked(false);
      setEditKs(null);
      loadInstanceFields(0, drafts);
      return;
    }
    instDraftsRef.current = [];
    setInstList([]);
    setActiveInst(0);
    editIdentityRef.current = preset?.identity ?? null;
    editLineIndexRef.current = preset?.lineIndex ?? null;
    setReturnCtx(preset?.returnCtx ?? null);
    setReturnView(false);
    const presetKs = (preset as any)?.kitchen_status || '';
    setEditKs(presetKs || null);
    setSingleLocked(LOCKED_KS.includes(presetKs));
    setSelectedVariant(preset?.variantId ?? undefined);
    setNoteForProduct(preset?.note ?? '');
    setEditCourse(preset?.course ?? null);
    setEditIsHold(!!preset?.is_hold);
    setSelectedAllergens(preset?.allergens ?? []);
    setQty(preset?.quantity && preset.quantity > 0 ? preset.quantity : 1);
    const sel: Record<string, number> = preset?.modifiers ? { ...preset.modifiers } : {};
    // House default: exclusive (max-1) groups preselect their default member
    // (is_default, fallback: first ₼0 option — e.g. "Standart" in serving
    // style) when no explicit selection exists for the group.
    const expandedProduct = products.find(p => p.id === expandedId) as GridItem | undefined;
    for (const g of ((expandedProduct?.modifier_groups as any[]) || [])) {
      if (Number(g.max_select) === 1 && Array.isArray(g.item_ids) && g.item_ids.length > 0) {
        const hasSel = g.item_ids.some((id: string) => (sel[id] || 0) > 0);
        if (!hasSel) {
          const items = ((expandedProduct?.modifiers as any[]) || []).filter(m => g.item_ids.includes(m.id));
          const def = items.find(m => m.is_default) || items.find(m => !Number(m.price));
          if (def) sel[def.id] = 1;
        }
      }
    }
    setSelectedModifiers(sel);
  }, [expandedId]);

  // 2026-09-30 (owner, round 8b): CART → MODAL half of the live qty binding.
  // While the editor is open, any EXTERNAL change to the edited lines'
  // quantities (cart row ±, group +, void, kitchen updates) flows into the
  // drafts — and into the `qty` stepper when it's the ACTIVE instance.
  // Loop-safe: the modal's own pushes (onLiveQtyChange) write the SAME value
  // into the cart, so this comparison only ever fires on external changes.
  useEffect(() => {
    if (!expandedId || !cartItemQtys || cartItemQtys.length === 0) return;
    if (multiInst) {
      const drafts = instDraftsRef.current;
      let changed = false;
      for (let i = 0; i < drafts.length; i++) {
        const li = (drafts[i] as any).lineIndex;
        const cq = li != null && li >= 0 ? cartItemQtys[li] : undefined;
        if (cq != null && cq > 0 && drafts[i].quantity !== cq) {
          drafts[i] = { ...drafts[i], quantity: cq };
          changed = true;
          if (i === Math.min(activeInst, drafts.length - 1)) setQty(cq);
        }
      }
      if (changed) setInstList([...drafts]);
    } else if (editLineIndexRef.current != null && editLineIndexRef.current >= 0) {
      const cq = cartItemQtys[editLineIndexRef.current];
      if (cq != null && cq > 0 && cq !== qty) setQty(cq);
    }
  }, [cartItemQtys, expandedId, multiInst, activeInst, qty]);

  useImperativeHandle(ref, () => ({
    openEditor: (productId: string, preset?: EditorPreset) => {
      presetRef.current = preset ?? null;
      const el = cardRefs.current[productId];
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        el.scrollIntoView({ block: 'center' });
      }
      setExpandedId(productId);
    },
    toggleEditor: (productId: string, preset?: EditorPreset) => {
      if (expandedIdRef.current === productId) {
        setExpandedId(null);
        return;
      }
      presetRef.current = preset ?? null;
      const el = cardRefs.current[productId];
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        el.scrollIntoView({ block: 'center' });
      }
      setExpandedId(productId);
    }
  }), []);

  const navbarCategories = useMemo(() => {
    const comboCat: { id: string; name: string } = { id: COMBO_TAB, name: t('combos') };
    return [comboCat, ...categories];
  }, [categories]);

  const filtered = useMemo(() => {
    const items: GridItem[] = products.map(p => ({ ...p, _isCombo: false, variants: variantsByProduct?.[p.id] || [] }));

    if (combos) {
      for (const c of combos) {
        items.push({
          id: c.id,
          name: c.name,
          price: c.price,
          category_id: c.category_id,
          image_url: c.image_url,
          name_az: c.name_az,
          name_en: c.name_en,
          name_ru: c.name_ru,
          effective_price: c.effective_price && c.effective_price < c.price ? {
            base_price: c.price,
            effective_price: c.effective_price,
            discount_amount: c.price - c.effective_price,
            discount_type: null,
            campaign_id: null,
            campaign_label: null,
            campaign_badge: null,
          } : undefined,
          _isCombo: true,
          _raw: c,
        });
      }
    }

    let list = items;
    if (categoryFilter === COMBO_TAB) {
      list = list.filter(p => p._isCombo);
    } else if (categoryFilter) {
      list = list.filter(p => p.category_id === categoryFilter && !p._isCombo);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => {
        const name = (language === 'az' ? p.name_az : language === 'en' ? p.name_en : p.name_ru) || p.name || '';
        return name.toLowerCase().includes(q);
      });
    }
    // Son / Məşur / Sevimli tabs — previously rendered but never filtered
    // (the state was used only for the tab highlight). Applied last so search
    // keeps working on top of the filtered set.
    if (!search.trim() && activeFilter !== 'all') {
      if (activeFilter === 'recent' && filterData?.recent?.length) {
        const orderMap = new Map(filterData.recent.map((r, i) => [r.id, i]));
        list = list.filter(p => !p._isCombo && orderMap.has(p.id))
          .sort((a, b) => (orderMap.get(a.id)! - orderMap.get(b.id)!));
      } else if (activeFilter === 'popular' && filterData?.popular?.length) {
        const orderMap = new Map(filterData.popular.map((p, i) => [p.id, i]));
        list = list.filter(p => !p._isCombo && orderMap.has(p.id))
          .sort((a, b) => (orderMap.get(a.id)! - orderMap.get(b.id)!));
      }
    }
    return list;
  }, [products, combos, categoryFilter, search, language, outOfStock, activeFilter, filterData]);

  const handleAdd = (item: GridItem) => {
    if (item._isCombo) {
      if (onAddCombo && item._raw) onAddCombo(item._raw);
    } else {
      onAddProduct(item);
    }
  };

  const handleCardClick = (item: GridItem) => {
    handleAdd(item);
    setPulseMap(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
    setBounceMap(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
    setTimeout(() => {
      setPulseMap(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, 1200);
    setTimeout(() => {
      setBounceMap(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, 800);
  };

  const handleClose = () => {
    setExpandedId(null);
  };

  // 2026-09-24 (owner, FINAL): return flow inside the details panel.
  const startReturn = () => {
    if (!returnCtx || returnLoading) return;
    setReturnQty(Math.min(returnCtx.quantity, returnCtx.quantity) || 1);
    setReturnReason('');
    setReturnReasonText('');
    setReturnPinOpen(true);
  };

  const handleReturnFate = async (fate: 'stock' | 'waste') => {
    if (!returnCtx || returnLoading) return;
    // 2026-09-25 (owner): reason is MANDATORY before a return can be logged —
    // the DB row (log_audit.reason / inventory_logs) feeds the statistics page.
    if (!returnReason) {
      toast(t('pick_return_reason') || 'Əvvəlcə səbəb seçin', { id: 'pos-hint', duration: 2500 });
      return;
    }
    setReturnLoading(true);
    try {
      const res = fate === 'stock'
        ? await apiFetch('/api/orders/return-to-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_item_id: returnCtx.order_item_id, quantity: returnQty, reason: returnReason, reason_text: returnReasonText || null }),
          })
        : await apiFetch('/api/orders/waste', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_item_id: returnCtx.order_item_id, quantity: returnQty, reason: returnReason, reason_text: returnReasonText || null }),
          });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`${returnQty}x ${returnCtx.product_name} — ${fate === 'stock'
          ? (t('returned_to_stock') || 'Anbara qaytarıldı')
          : (t('waste_recorded') || 'İtki qeyd edildi')}`);
        // 2026-09-25 (owner: "sonra öz avtomatik bağlanmırdı"): DETERMINISTIC
        // close — reset the ENTIRE return state, then close the modal. A
        // stale returnCtx/returnView/returnReason must never survive a
        // successful submit.
        setReturnView(false);
        setReturnCtx(null);
        setReturnReason('');
        setReturnReasonText('');
        setReturnPinOpen(false);
        handleClose();
      } else {
        toast.error(data.error || (fate === 'stock'
          ? (t('return_failed') || 'Qaytarılma uğursuz oldu')
          : (t('waste_failed') || 'İtki qeyd edilmədi')));
      }
    } catch {
      toast.error(t('network_error') || 'Şəbəkə xətası');
    } finally {
      setReturnLoading(false);
    }
  };

  const expandedItem = filtered.find(item => item.id === expandedId);

  // Variantlı məhsulda heç nə seçilməyibsə default variantı seç.
  useEffect(() => {
    if (!expandedItem) return;
    const def = (expandedItem.variants || []).find((v: any) => v.is_default) || (expandedItem.variants || [])[0];
    if (def) setSelectedVariant(prev => prev ?? def.id);
  }, [expandedItem]);

  // Escape closes the product modal — but NOT while the return-PIN overlay is
  // up: PinGuard has its own Escape handler and only IT should close, so the
  // details panel stays open underneath when the PIN is cancelled.
  useEffect(() => {
    if (!expandedId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !returnPinOpen) handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expandedId, returnPinOpen]);

  // Modal header price — variant + seçilmiş modifikatorlar daxil
  const selectedVariantObj = useMemo(
    () => (expandedItem?.variants ?? []).find((v: any) => v.id === selectedVariant),
    [expandedItem, selectedVariant]
  );
  const modifiersTotal = useMemo(() => Object.entries(selectedModifiers).reduce((sum, [id, q]) => {
    const m = (expandedItem?.modifiers ?? []).find((x: any) => x.id === id);
    return sum + Number(m?.price || 0) * (q || 0);
  }, 0), [expandedItem, selectedModifiers]);
  const variantUnitPrice = selectedVariantObj
    ? Number(selectedVariantObj.discount_price != null && selectedVariantObj.discount_price !== '' ? selectedVariantObj.discount_price : (selectedVariantObj.price ?? 0))
    : null;
  const baseUnitPrice = Number(expandedItem?.effective_price?.effective_price ?? expandedItem?.effective_price ?? expandedItem?.price ?? 0);
  // Single source of truth: must match addToCart's unit-price math (variant
  // base minus campaign amount; the no-variant path already uses
  // effective_price with the campaign baked in) so the modal total and the
  // cart line total never disagree.
  const effObj = (expandedItem as any)?.effective_price;
  const modalCampaignAmt = typeof effObj === 'object' && effObj ? Number(effObj.discount_amount) || 0 : 0;
  const modalUnitPrice = (variantUnitPrice != null
    ? (modalCampaignAmt > 0 ? Math.max(0, variantUnitPrice - modalCampaignAmt) : variantUnitPrice)
    : baseUnitPrice) + modifiersTotal;
  const modalName = (language === 'az' ? expandedItem?.name_az : language === 'en' ? expandedItem?.name_en : expandedItem?.name_ru) || expandedItem?.name || '';

  const handleModalAdd = () => {
    if (!expandedItem) return;
    // 2026-09-28 (owner: pill tabs): MULTI-INSTANCE save — commit the active
    // draft, then send EVERY instance's draft in ONE atomic call
    // (applyInstanceEdits = single setCart; unchanged instances are skipped
    // server-side-safe by the diff inside).
    if (multiInst) {
      commitInstanceDraft();
      const drafts = instDraftsRef.current;
      const edits = drafts.map((d: any) => ({
        lineIndex: d.lineIndex,
        // 2026-09-28 (owner P2): drafts created by the modal's Miqdar "+" are
        // NEW instances (lineIndex -1) — applyInstanceEdits appends them as
        // fresh cart lines instead of replacing anything.
        isNew: !!d.__isNew,
        quantity: d.quantity,
        variantId: d.variantId ?? null,
        notes: d.note || '',
        modifiers: (Object.entries(d.modifiers || {}) as [string, number][])
          .filter(([, q]) => q > 0)
          .map(([id, q]) => {
            const mod = (expandedItem.modifiers || []).find((x: any) => x.id === id);
            return { id, name: mod?.name || '', price: Number(mod?.price || 0), quantity: q };
          }),
        course: d.course,
        isHold: !!d.is_hold,
        allergens: d.allergens || [],
      }));
      onApplyInstanceEdits?.(expandedItem as PosProduct, edits as any);
      instDraftsRef.current = [];
      setInstList([]);
      setActiveInst(0);
      setReturnCtx(null);
      setReturnView(false);
      setNoteForProduct('');
      setSelectedVariant(undefined);
      setSelectedModifiers({});
      setEditCourse(null);
      setEditIsHold(false);
      setSelectedAllergens([]);
      setQty(1);
      handleClose();
      return;
    }
    const identity = editIdentityRef.current;
    editIdentityRef.current = null;
    if (expandedItem._isCombo && onAddCombo) {
      onAddCombo(expandedItem._raw);
    } else {
      const selectedMods = Object.entries(selectedModifiers)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => {
          const mod = (expandedItem.modifiers || []).find((x: any) => x.id === id);
          return { id, name: mod?.name || '', price: Number(mod?.price || 0), quantity: q };
        });
      onAddProduct({ ...expandedItem, special_notes: noteForProduct || undefined, variant_id: selectedVariant || undefined, __expanded: true, __qty: qty, __modifiers: selectedMods, __editOf: identity ? { identity, lineIndex: editLineIndexRef.current ?? undefined } : undefined, __course: editCourse ?? undefined, __is_hold: editIsHold, __allergens: selectedAllergens, __newUnitPrice: modalUnitPrice } as any);
    }
    setNoteForProduct('');
    setSelectedVariant(undefined);
    setSelectedModifiers({});
    setEditCourse(null);
    setEditIsHold(false);
    setSelectedAllergens([]);
    setQty(1);
    handleClose();
  };

  const cardBg = lightMode
    ? 'bg-white border-zinc-200 shadow-lg shadow-black/5'
    : 'bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20';
  const cardText = lightMode ? 'text-gray-900' : 'text-white';
  const cardPrice = lightMode ? 'text-gray-900' : 'text-white';
  const cardSecondary = lightMode ? 'text-gray-500' : 'text-white/50';
  // 2026-09-28 (owner: light mode — yalnız mavi/qara)
  const comboLabelBg = lightMode ? 'bg-zinc-900 text-white' : 'bg-amber-500/10 text-amber-400';
  const expandedBg = lightMode ? 'bg-white border-zinc-200' : 'bg-[#1a1a1a] border-white/10';
  const expandedText = lightMode ? 'text-gray-900' : 'text-white';
  const expandedSecondary = lightMode ? 'text-gray-600' : 'text-white/60';
  const expandedInputBg = lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black' : 'bg-white/5 border-white/10 text-white';
  const expandedInputPlaceholder = lightMode ? 'text-zinc-400' : 'text-white/40';
  const expandedBtnBg = lightMode ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-emerald-500 hover:bg-emerald-600';
  const compactImgBg = lightMode ? 'bg-zinc-100' : 'bg-white/50 dark:bg-black/20';
  const compactPriceLine = lightMode ? 'text-gray-400' : 'text-white/40';
  const compactPriceMuted = lightMode ? 'text-gray-500' : 'text-white/50';

  return (
    <>
    <div className="flex flex-col h-full relative">
      {/* Search Bar — Apple style focus: border + glow + soft shadow */}
      <div className="relative mb-4 flex-shrink-0">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('search_products' as any)}
           className={`peer w-full rounded-3xl pl-12 pr-4 py-3 text-sm outline-none border bg-[var(--theme-surface-muted)] transition-all duration-200
             ${lightMode
               ? 'text-gray-900 border-zinc-300 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 shadow-md shadow-black/5 focus:shadow-[0_0_20px_rgba(120,120,120,0.25)]'
               : 'text-white border-white/10 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/20 shadow-md shadow-black/20 focus:shadow-[0_0_20px_rgba(120,120,120,0.3)]'}`}
        />
      </div>

      {/* Filter Tabs */}
      <div className="mb-3 flex-shrink-0 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
           {FILTER_TABS.map(tab => (
             <motion.button
               key={tab.id}
               onClick={() => { setActiveFilter(tab.id); setCategoryFilter(null); }}
               whileHover={{ y: -1 }} whileTap={{ scale: 0.94 }}
               transition={TAP}
               className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap border transition-colors ${
                 activeFilter === tab.id
                   ? (lightMode ? 'bg-zinc-900 text-white border-zinc-900 shadow-lg shadow-zinc-900/20' : 'bg-white text-zinc-950 border-white shadow-lg shadow-white/10')
                   : lightMode ? 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
               }`}
            >
             <tab.icon size={12} />
              {t(tab.labelKey as any)}
            </motion.button>
          ))}

          {/* 2026-09-25 (owner): MƏTBƏX status button — next to HAMISI/SON/MƏŞHUR.
              Replaces the removed cart chip (ugly native tooltip). Tap → hint
              with ALL portions: hazırlanır / hazır / draft (every open order). */}
          <div className="relative flex-shrink-0 ml-0.5">
            <motion.button
              ref={kitchenBtnRef}
              onClick={() => {
                if (kitchenHintOpen) { setKitchenHintOpen(false); return; }
                // Capture the button's rect → fixed-position panel below it
                // (fixed escapes the row's overflow-x-auto clipping).
                const r = kitchenBtnRef.current?.getBoundingClientRect();
                if (r) {
                  const panelW = 272; // w-[272px] (2026-09-28 Apple-feel card)
                  setKitchenHintPos({
                    top: r.bottom + 8,
                    left: Math.min(Math.max(8, r.left), window.innerWidth - panelW - 8),
                  });
                }
                setKitchenHintOpen(true);
              }}
               whileTap={{ scale: 0.94 }}
               transition={TAP}
                className={`relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap border transition-colors ${
                  kitchenHintOpen
                    ? (lightMode ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-950 border-white')
                    : tkActive
                      ? (lightMode ? 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200' : 'bg-white/8 border-white/20 text-white/85 hover:bg-white/12')
                      : (lightMode ? 'bg-white border-zinc-200 text-zinc-400 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10')
                }`}
              >
                <span className={`relative inline-flex items-center justify-center ${tkActive ? 'saito-flame-wrap' : ''}`}>
                  {/* 2026-09-28 (owner: light mode — yalnız mavi/qara): alov = qara */}
                  <Flame size={12} className={tkActive ? `saito-flame ${lightMode ? 'text-zinc-900' : 'text-orange-400'}` : ''} />
                  {tkActive && <span className="saito-flame-glow" aria-hidden />}
                </span>
                {t('tab_kitchen') || 'Mətbəx'}
                {tkActive && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-zinc-900 text-white text-[10px] font-black tabular-nums flex items-center justify-center leading-none border border-white/20">
                    {tkCount}
                  </span>
                )}
              </motion.button>
          </div>
       </div>

       {/* MƏTBƏX hint — rendered OUTSIDE the overflow-x-auto filter row (2026-09-26):
           absolute positioning inside the row was clipped by the scroll container
           (present in DOM/ARIA, invisible in pixels). Fixed + backdrop as siblings. */}
         {/* 2026-09-27 (owner: the jittery flame was "çirkin" → refined): the
             icon stays STILL; only a soft ember glow breathes (opacity-only,
             2.4s — the same slow cadence as the motion system's state
             transitions). No scale, no skew, no jitter. */}
         <style>{`
           @keyframes saito-flame-breathe {
             0%, 100% { opacity: .55; }
             50%      { opacity: 1; }
           }
           .saito-flame { animation: saito-flame-breathe 2.4s ease-in-out infinite; }
           @keyframes saito-glow-breathe {
             0%, 100% { opacity: .16; }
             50%      { opacity: .45; }
           }
            .saito-flame-glow {
              position: absolute; inset: -5px; border-radius: 9999px; pointer-events: none;
              /* 2026-09-28 (owner: light mode — yalnız mavi/qara): light = qara glow */
              background: radial-gradient(circle, ${lightMode ? 'rgba(24,24,27,.35)' : 'rgba(251,146,60,.5)'} 0%, ${lightMode ? 'rgba(24,24,27,0)' : 'rgba(251,146,60,0)'} 70%);
              animation: saito-glow-breathe 2.4s ease-in-out infinite;
            }
         `}</style>
         {kitchenHintOpen && <div className="fixed inset-0 z-[60]" onClick={() => setKitchenHintOpen(false)} />}
         <AnimatePresence>
           {kitchenHintOpen && kitchenHintPos && (
             /* 2026-09-27 (owner): SELECTED TABLE ONLY.
                2026-09-28 (owner: "sablon kimi etmə, Apple feyzi ilə qəşəng et"):
                frosted single-surface card — no colored tile chips; hierarchy
                comes from BIG tabular numbers (color on the number, not the
                fill), small-caps labels, hairline dividers, soft depth. */
             <motion.div
               initial={{ opacity: 0, y: -8, scale: 0.98 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.28, ease: [0.45, 0, 0.55, 1] } }}
               transition={{ type: 'spring', stiffness: 500, damping: 26 }}
               className="fixed z-[70] w-[272px] rounded-[28px] border overflow-hidden backdrop-blur-xl"
               style={{
                 top: kitchenHintPos.top,
                 left: kitchenHintPos.left,
                 ...(lightMode
                   ? { background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.07)', boxShadow: '0 20px 55px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)' }
                   : { background: 'rgba(20,20,24,0.94)', borderColor: 'rgba(255,255,255,0.09)', boxShadow: '0 24px 70px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)' }),
               }}
             >
               <div className="pt-4 pb-4 px-5">
                 <div className="flex items-center justify-between mb-3">
                   <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                     {t('kitchen_status') || 'Mətbəx statusu'}
                   </p>
                   <span className={`w-1.5 h-1.5 rounded-full ${tkActive ? (lightMode ? 'bg-zinc-900' : 'bg-orange-400') : lightMode ? 'bg-zinc-300' : 'bg-white/20'}`} />
                 </div>
                 {currentTableKitchen ? (
                   <>
                     <div className={`flex items-center gap-2.5 px-3.5 py-3 rounded-2xl border mb-3 ${lightMode ? 'bg-white border-zinc-200/70 shadow-sm' : 'bg-white/[0.045] border-white/[0.07]'}`}>
                       <span className="relative flex w-2 h-2">
                         <span className="w-2 h-2 rounded-full bg-emerald-500" />
                         {(tkActive) && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-40" />}
                       </span>
                       <span className={`text-[13px] font-bold tracking-tight ${lightMode ? 'text-zinc-900' : 'text-white/90'}`}>{currentTableKitchen.label}</span>
                       <span className={`ml-auto text-[9px] font-black uppercase tracking-[0.16em] ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>Seçilmiş</span>
                     </div>
                     {tkCount + currentTableKitchen.draft === 0 ? (
                       <p className={`text-xs font-semibold py-4 text-center ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                         Bu sifarişdə mətbəxə göndərilən hissə yoxdur
                       </p>
                     ) : (
                       <div
                         className={`grid grid-cols-3 rounded-2xl border overflow-hidden ${lightMode ? 'border-zinc-200/70' : 'border-white/[0.07]'}`}
                         style={{
                           background: lightMode ? 'rgba(24,24,27,0.02)' : 'rgba(255,255,255,0.02)',
                           ['--div' as any]: lightMode ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
                         }}
                       >
                         {[
                           { n: currentTableKitchen.draft, label: t('st_draft') || 'draft', num: lightMode ? 'text-zinc-800' : 'text-white/80' },
                           { n: currentTableKitchen.prep, label: t('st_preparing') || 'hazırlanır', num: lightMode ? 'text-zinc-900' : 'text-orange-400' },
                           { n: currentTableKitchen.ready, label: t('st_ready') || 'hazır', num: lightMode ? 'text-emerald-600' : 'text-emerald-400' },
                         ].map((s, i) => (
                           <div key={s.label} className="px-1 py-3.5 text-center" style={i > 0 ? { boxShadow: 'inset 1px 0 0 var(--div)' } : undefined}>
                             <p className={`text-[24px] font-black tabular-nums leading-none tracking-tight ${s.num} ${s.n === 0 ? 'opacity-25' : ''}`}>{s.n}</p>
                             <p className={`text-[9px] font-black uppercase tracking-[0.14em] mt-2 ${lightMode ? 'text-zinc-400' : 'text-white/35'} ${s.n === 0 ? 'opacity-50' : ''}`}>{s.label}</p>
                           </div>
                         ))}
                       </div>
                     )}
                   </>
                 ) : (
                   <p className={`text-xs font-semibold py-4 text-center ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                     Sifariş seçilməyib
                   </p>
                 )}
               </div>
             </motion.div>
           )}
         </AnimatePresence>

      {/* Categories */}
      <div className="mb-4 flex-shrink-0">
        <LiquidCategoryNavbar
          categories={navbarCategories}
          activeId={categoryFilter}
          onChange={(id: string | null) => { setCategoryFilter(id); setActiveFilter('all'); }}
          allLabel={t('all' as any)}
        />
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto pr-1 pt-2 relative z-0" style={{ paddingBottom: vkHeight > 0 ? vkHeight + 12 : 0 }}>
        {catalogError ? (
          <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-zinc-100 text-zinc-900' : 'bg-amber-500/10 text-amber-400'}`}>
              <AlertTriangle size={28} strokeWidth={2} />
            </div>
            <p className={`text-sm font-black uppercase tracking-widest max-w-xs ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>{t('products_load_failed')}</p>
            {onRetryCatalog && (
              <button
                onClick={onRetryCatalog}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] ${lightMode ? 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100' : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'}`}
              >
                <RefreshCw size={14} />
                {t('retry')}
              </button>
            )}
          </div>
        ) : (products.length === 0 && (combos?.length ?? 0) === 0) ? (
          <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/5 text-white/30'}`}>
              <PackageOpen size={28} strokeWidth={1.8} />
            </div>
            <p className={`text-sm font-black uppercase tracking-widest max-w-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('no_products_available')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className={`w-14 h-14 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/5 text-white/30'}`}>
              <Search size={24} strokeWidth={1.8} />
            </div>
            <p className={`text-sm font-black uppercase tracking-widest max-w-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>
              {search.trim() ? t('no_products_found') : categoryFilter ? t('no_products_in_category') : t('no_products_available')}
            </p>
          </div>
        ) : (
          <>
        {outOfStock && outOfStock.size > 0 && (
          <div className="flex items-center justify-end mb-3 flex-shrink-0 pr-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${lightMode ? 'bg-rose-50 text-rose-500' : 'bg-rose-500/10 text-rose-400'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              {outOfStock.size} {t('out_of_stock')}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 relative overflow-visible">
          {filtered.map((item) => {
            const name = (language === 'az' ? item.name_az : language === 'en' ? item.name_en : item.name_ru) || item.name;
            const count = cartCounts[item.id] || 0;
            const isCombo = item._isCombo;
            const isOutOfStock = outOfStock?.has(item.id);
            const isExpanded = expandedId === item.id;
            const layoutId = `product-card-${item.id}`;

            return (
              <div
                key={`${isCombo ? 'combo-' : ''}${item.id}`}
                ref={el => { cardRefs.current[item.id] = el; }}
                className="relative col-span-1 row-span-1 overflow-visible"
              >
                {/* 1. Compact Card — expand zamanı DOM-dan ÇIXARILIR (yalnız bir
                    layoutId elementi qalır: modal). Beləcə framer "crossfade restore"
                    glitchi mümkün dehil — arxada geri qayıtacaq kart yoxdur. */}
                {isExpanded ? (
                  <div aria-hidden className="relative flex flex-col rounded-4xl opacity-0 pointer-events-none select-none">
                    <div className="aspect-square w-full" />
                    <div className="pt-4 px-1 pb-3 space-y-2">
                      <div className="h-4 rounded-xl bg-black/5 dark:bg-white/5" />
                      <div className="h-4 w-1/2 rounded-xl bg-black/5 dark:bg-white/5" />
                    </div>
                  </div>
                ) : (
                   <motion.div
                   layoutId={layoutId}
                   transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
                   whileTap={{ scale: 0.96, transition: { type: 'spring', stiffness: 400, damping: 35, mass: 0.4 } }}
                    className={`relative flex flex-col rounded-4xl border overflow-hidden cursor-pointer shadow-card [transition:opacity_0.25s_ease,filter_0.25s_ease,border-color_0.25s_ease] ${cardBg} ${
                      isOutOfStock ? 'opacity-50 grayscale border-rose-500/30' : ''
                    }`}
                   onClick={() => { if (!isOutOfStock) { handleCardClick(item); } }}
                 >
                  {/* Cart count badge - always visible, bounces smoothly without disappearing */}
                   {count > 0 && (
                     <motion.div
                       key={`overlay-badge-${item.id}`}
                       initial={{ scale: 1 }}
                       animate={bounceMap[item.id] ? { scale: [1, 1.1, 1.02, 1] } : { scale: 1 }}
                       transition={{ duration: bounceMap[item.id] ? 0.4 : 0.2, ease: "easeOut" }}
                        className={`absolute top-2 left-2 z-20 flex items-center gap-1 rounded-full px-2.5 py-1 border text-xs font-black tabular-nums ${lightMode ? 'bg-zinc-900/80 border-zinc-800 text-white' : 'bg-zinc-900/80 border-zinc-700 text-white'}`}
                        >
                        <ShoppingCart size={10} className="text-white" />
                        <motion.span
                          key={`count-${item.id}-${count}`}
                          initial={{ scale: 1 }}
                          animate={pulseMap[item.id] ? { scale: [1, 1.15, 1.03, 1] } : { scale: 1 }}
                          transition={{ duration: pulseMap[item.id] ? 0.5 : 0.25, ease: "easeOut" }}
                          className="text-xs font-black text-white whitespace-nowrap">
                          {count}
                        </motion.span>
                      </motion.div>
                  )}
                   {isOutOfStock && (
                     <div className={`absolute top-2 left-2 z-20 flex items-center gap-1 rounded-full px-2 py-1 border text-xs font-black tabular-nums ${lightMode ? 'bg-zinc-900/80 border-zinc-800 text-white' : 'bg-zinc-900/80 border-zinc-700 text-white'}`}>
                       <Ban size={10} className="text-white" />
                       <span className="whitespace-nowrap">{t('out_of_stock')}</span>
                     </div>
                   )}
 
                   <motion.div
                     className="flex flex-col h-full p-3"
                   >
                    <div className="aspect-square w-full overflow-hidden rounded-3xl bg-white/50 dark:bg-black/20">
                      {item.image_url && !failedImages.has(item.image_url) ? (
                        <img src={item.image_url} alt={name}
                          onError={() => {
                            const url = item.image_url!;
                            setFailedImages(prev => (prev.has(url) ? prev : new Set(prev).add(url)));
                          }}
                           className="w-full h-full object-cover group-hover:scale-110" loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl font-black opacity-20 uppercase">{name.slice(0, 2)}</div>
                      )}
                    </div>
                    <div className="pt-4 px-1 space-y-1">
                      {item.effective_price?.campaign_badge && (
                        <span className="inline-block text-xs font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full mb-1"
                          style={{ color: item.effective_price.campaign_badge || '#D4AF37', backgroundColor: `${item.effective_price.campaign_badge || '#D4AF37'}20` }}>
                          {item.effective_price.campaign_label || t('savings')}
                        </span>
                      )}
                      <p className={`text-sm font-bold truncate leading-tight ${cardText}`}>{name}</p>
                      <AllergenBadges item={item} />
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-2">
                          {item.effective_price && item.effective_price.effective_price < item.effective_price.base_price ? (
                            <>
                              <p className={`text-sm font-black ${cardPrice}`}>₼ {item.effective_price.effective_price.toFixed(2)}</p>
                              <p className={`text-xs font-bold line-through ${compactPriceLine}`}>₼ {item.effective_price.base_price.toFixed(2)}</p>
                            </>
                           ) : (
                            /* QA bug 6 (2026-09-22): hardened fallback chain —
                               the API always returns an effective_price OBJECT,
                               but any partial/stale shape (number, null) used
                               to render an empty price. Number() guard makes a
                               blank price impossible when ANY price source exists. */
                            <p className={`text-sm font-black ${cardPrice}`}>₼ {Number(item.effective_price?.effective_price ?? item.effective_price ?? item.price ?? 0).toFixed(2)}</p>
                          )}
                        </div>
                         <div className="flex items-center gap-1.5 min-w-0">
                           {isCombo && (
                             <span className={`inline-block text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${comboLabelBg}`}>
                               {t('combos')}
                             </span>
                           )}
                         </div>
                      </div>
                    </div>
                      </motion.div>
                    </motion.div>
                )}
               </div>
             );
           })}
        </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* 2. MƏHSUL MODALI (720px) — yalnız məhsulun öz seçimləri:       */}
      {/*    başlıq+qiymət+allergenlər, miqdar, modifikatorlar, qeyd, Add */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {expandedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={appleBackdrop}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4" style={{ paddingBottom: 'var(--vk-height, 0px)' }}
            onClick={handleClose}
          >
            <motion.div
              key="product-modal-card"
              layoutId={`product-card-${expandedItem.id}`}
              transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              // QA bug 1 (2026-09-22): bounded flex column — the card used to be
              // header + max-h-[55vh] body + footer in unbounded flow, so on shorter
              // screens the footer button overlapped the QEYD input by ~14px. Now:
              // card ≤ 92vh, body scrolls internally, footer stays visible.
              onClick={(e) => e.stopPropagation()}
               className={`w-full max-w-[820px] max-h-[92vh] flex flex-col rounded-4xl border shadow-elevated overflow-hidden ${expandedBg}`}
             >
                {/* Header: görsəl · ad · qiymət · allergenlər.
                    2026-09-23 (owner): the container was MISSING `flex` —
                    justify-between/items-start were no-ops and the X button
                    rendered BELOW the title block instead of top-right. */}
                <div className={`flex flex-shrink-0 items-start justify-between gap-4 p-5 pb-4 border-b ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-[72px] h-[72px] rounded-3xl overflow-hidden shrink-0 ${lightMode ? 'bg-zinc-100' : 'bg-white/10'}`}>
                    {expandedItem.image_url && !failedImages.has(expandedItem.image_url) ? (
                      <img src={expandedItem.image_url} alt={modalName} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center text-2xl font-black opacity-20 uppercase ${expandedText}`}>{(modalName || '?').slice(0, 2)}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xl font-black truncate leading-tight ${expandedText}`}>{modalName}</p>
                    <p className={`text-lg font-black mt-0.5 ${expandedSecondary}`}>₼ {modalUnitPrice.toFixed(2)}</p>
                    {/* 2026-09-28 (owner: "allergenlər sətrini aşağıda ayrıca
                        bölmə kimi göstərin"): the allergen chips moved OUT of
                        the header — they now live in their own section at the
                        BOTTOM of the modal (below Qeyd). The header is back to
                        görsəl · ad · qiymət only. */}
                  </div>
                </div>
                <motion.button onClick={(e) => { e.stopPropagation(); handleClose(); }}
                  whileHover={{ rotate: 90, scale: 1.06 }} whileTap={{ scale: 0.82 }}
                  transition={SPRING}
                  className={`p-2 rounded-xl border shrink-0 ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-red-400' : 'border-white/10 text-white hover:bg-white/10 hover:text-red-400'}`}>
                  <X size={20} />
                </motion.button>
              </div>

                {/* Body + Footer morph (2026-09-24, owner, FINAL):
                    edit view ⇄ return view — same card, same header, the
                    content below slides (x ±36, 200ms). */}
                <AnimatePresence mode="wait" initial={false}>
                {returnCtx && returnView ? (
                  <motion.div
                    key="return-view"
                    initial={{ opacity: 0, x: 36 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -36 }}
                    transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                    className="flex-1 min-h-0 flex flex-col"
                  >
                    <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
                      <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
                        <p className={`text-sm font-bold ${lightMode ? 'text-black' : 'text-white'}`}>{returnCtx.product_name}</p>
                        <div className="flex items-center justify-between mt-3">
                          <p className={`text-[11px] font-bold tabular-nums ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                            ₼{returnCtx.unit_price.toFixed(2)} / ədəd
                          </p>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setReturnQty(q => Math.max(1, q - 1))}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-black transition-all ${lightMode ? 'bg-white border-zinc-200 hover:bg-zinc-50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                              −
                            </button>
                            <span className={`w-10 text-center text-sm font-black tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>{returnQty}</span>
                            <button onClick={() => setReturnQty(q => Math.min(returnCtx.quantity, q + 1))}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-black transition-all ${lightMode ? 'bg-white border-zinc-200 hover:bg-zinc-50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                       {/* 2026-09-25 (owner): MƏCBURİ reason — the fate buttons
                           stay disabled until a code is picked; the code + note
                           are persisted to the DB (log_audit) for statistics. */}
                       <div>
                         <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                           {t('return_reason') || 'Səbəb'} <span className="text-red-400">*</span>
                         </p>
                         <div className="flex flex-wrap gap-1.5">
                           {RETURN_REASONS.map(r => {
                             const on = returnReason === r.code;
                             const lbl = language === 'en' ? r.en : language === 'ru' ? r.ru : r.az;
                             return (
                               <button key={r.code} onClick={() => setReturnReason(r.code)}
                                 className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-all active:scale-[0.97] ${
                                   on
                                     ? 'bg-[#3b82f6] text-white border-[#3b82f6] shadow'
                                     : lightMode ? 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                                 }`}>
                                 {lbl}
                               </button>
                             );
                           })}
                         </div>
                         <input
                           value={returnReasonText}
                           onChange={e => setReturnReasonText(e.target.value)}
                           maxLength={120}
                           placeholder={t('return_reason_note') || 'Qeyd (istifadə oluna bilər)'}
                           className={`mt-2 w-full h-10 px-3 rounded-xl border text-xs focus:outline-none focus:border-[#3b82f6] ${
                             lightMode ? 'bg-white border-zinc-200 text-zinc-800 placeholder:text-zinc-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/30'
                           }`}
                         />
                       </div>
                       <p className={`text-[9px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                         {t('item_fate') || 'Məhsulun taleyi'}
                       </p>
                       <button
                         onClick={() => handleReturnFate('stock')}
                         disabled={!returnReason || returnLoading}
                        className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
                          lightMode ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
                        }`}
                      >
                        <Package size={20} strokeWidth={2.5} />
                        <div>
                          <p className="text-sm font-black">{t('return_to_stock') || 'Anbara qaytar'}</p>
                          <p className={`text-[10px] font-bold ${lightMode ? 'text-blue-500' : 'text-blue-300/60'}`}>
                            {t('stock_increases') || 'Stock geri artırılır'}
                          </p>
                        </div>
                      </button>
                       <button
                         onClick={() => handleReturnFate('waste')}
                         disabled={!returnReason || returnLoading}
                        className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
                          lightMode ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                        }`}
                      >
                        <Trash2 size={20} strokeWidth={2.5} />
                        <div>
                          <p className="text-sm font-black">{t('write_off') || 'İtkiyə yaz'}</p>
                          <p className={`text-[10px] font-bold ${lightMode ? 'text-red-500' : 'text-red-300/60'}`}>
                            {t('stock_unchanged') || 'Stock dəyişmir'}
                          </p>
                        </div>
                      </button>
                    </div>
                    <div className="p-5 pt-0 flex-shrink-0">
                      <button
                        onClick={() => setReturnView(false)}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
                      >
                        <ArrowLeft size={14} /> {t('back') || 'Əvvəlki'}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                <motion.div
                  key="edit-view"
                  initial={false}
                  exit={{ opacity: 0, x: -36 }}
                  transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                  className="flex-1 min-h-0 flex flex-col"
                >
                {/* Body: miqdar · variantlar · modifikatorlar · qeyd —
                    flex-1 + min-h-0: scroll region is bounded by the card's
                    92vh cap (footer can never overlap it). */}
                 {/* 2026-09-30 (round 10b, E2E bug #9): the Qeyd pill (last
                    section) sat half-hidden at the scroll edge right up against
                    the sticky CTA footer — extra bottom breathing room. */}
                <div className="p-5 pb-10 space-y-5 flex-1 min-h-0 overflow-y-auto">
                   {/* 2026-09-28 (owner: "tiktokdaki kimi surusdurme pilli... orada
                       qeyd edekki 1 ci filadelyiya kremli, 2 ci taba kecid edirsen
                       yungul yazirsan"): ONE pill per instance — numbered circle +
                       hint label (exclusive-group choice, else first modifier name).
                       Swipeable: horizontal scroll + snap. Active pill = BLACK in
                       light / WHITE in dark (owner: light mode — yalnız mavi/qara).
                       Shown only when the collapsed row carries >1 instance. */}
                    {/* 2026-09-29 (owner, figure 1: "daha touch-friendly" +
                        "1-dən 2-yə keçəndə state-machine transition olsun"):
                        pills are now 44px-tall touch targets, and the active
                        capsule is ONE measured sliding element that SPRINGS
                        between pills (state→motion, Philosophy §1/§5). */}
                     {/* 2026-09-30 (owner, round 9): pill row now shows for ≥1
                         instance (was >1) — a single-variant editor also exposes
                         the "+ Yeni variant" tab at the end of the strip. */}
                     {multiInst && (
                      <div className="-mx-1 px-1">
                        <div
                          className="relative flex items-center gap-2 overflow-x-auto snap-x snap-mandatory pb-1"
                          style={{ scrollbarWidth: 'none' }}
                        >
                          {pillInd && (
                            <motion.div
                              aria-hidden
                              initial={false}
                              animate={{ x: pillInd.x, width: pillInd.w }}
                              transition={SPRING}
                              className={`absolute top-1 bottom-1 left-0 rounded-full ${lightMode ? 'bg-zinc-900' : 'bg-white'}`}
                            />
                          )}
                           {instList.map((d: any, i: number) => {
                             const on = i === activeInst;
                             // 2026-09-28 (owner P2): 'ready' joins the lock set;
                             // __isNew drafts (lineIndex -1) need a stable key
                             // that never collides across new instances.
                              const instLocked = LOCKED_KS.includes(d.kitchen_status || '');
                              // 2026-09-30 (owner, round 9): live spec label — the
                              // ACTIVE pill recomputes from the current selection
                              // (so "Kremli"→"Yüngül" updates as you tap); inactive
                              // pills show their committed d.hint. Locked → state.
                               // 2026-09-30 (round 9b): inactive pills with an EMPTY
                               // committed hint (legacy plain lines, saved before the
                               // round-9b default prefill) resolve through
                               // resolveHintName(d.modifiers) — the no-selection
                               // fallback yields the group's house default ("Standart").
                               const hintText = instLocked
                                 ? (d.kitchen_status === 'ready' ? 'Hazır' : 'Served')
                                 : (on ? (resolveHintName() || d.hint || '') : (d.hint || resolveHintName(d.modifiers as Record<string, number>) || ''));
                              return (
                               <button
                                 key={`inst-${d.__isNew ? `new-${i}` : d.lineIndex}`}
                                 ref={(el) => { instPillRefs.current[i] = el; }}
                                onClick={() => switchInstance(i)}
                                className={`relative flex items-center gap-2 min-h-[44px] pl-2.5 pr-4 snap-start text-[12px] font-black whitespace-nowrap active:scale-[0.97] [transition:color_0.2s_ease] ${
                                  on ? (lightMode ? 'text-white' : 'text-zinc-950') : lightMode ? 'text-zinc-500 hover:text-zinc-800' : 'text-white/50 hover:text-white/80'
                                }`}
                              >
                                 <span className={`relative z-10 flex items-center justify-center w-[22px] h-[22px] rounded-full text-[10px] tabular-nums ${
                                   on ? (lightMode ? 'bg-white/25' : 'bg-zinc-950/15') : lightMode ? 'bg-zinc-200/70 text-zinc-600' : 'bg-white/15 text-white/70'
                                 }`}>{i + 1}</span>
                                  {/* 2026-09-30 (owner, round 8b: "yuxardaki 1 və 2
                                      artmır — bu nə üçündür?"): the circle is the
                                      INSTANCE tab index, NOT the quantity. Each pill
                                      now carries its LIVE ×qty badge (draft qty —
                                      the cartItemQtys sync effect keeps it equal to
                                      the cart line), so MIQDAR+ is visible right
                                      on the pill.
                                      2026-09-30 (round 8c): the ACTIVE pill is the
                                      sliding capsule — WHITE in dark / BLACK in light
                                      (see the motion.div above, line ~1369). The badge
                                      text must CONTRAST that capsule, so it mirrors the
                                      button's active text color (dark-on-white in dark
                                      mode, white-on-black in light mode). Previously the
                                      two branches were SWAPPED (text-white on the white
                                      active capsule in dark mode), so the ×N badge was
                                      invisible exactly on the pill being edited — the
                                      owner's "instance artmır" (press +, active pill
                                      never shows the number growing). */}
                                  <span className={`relative z-10 shrink-0 text-[10px] font-black tabular-nums px-1 h-[18px] rounded-md flex items-center ${
                                    on ? (lightMode ? 'bg-white/15 text-white' : 'bg-zinc-900/10 text-zinc-800') : 'bg-transparent opacity-60'
                                  }`}>×{(d.quantity || 1)}</span>
                                    <span className="relative z-10 max-w-[110px] truncate">{hintText}</span>
                                  {/* 2026-09-30 (owner, round 9 fix — "＋ basdıqsa onu
                                      silmək olmur"): the ACTIVE pill exposes a small "×"
                                      to delete it (local drop for unsaved drafts;
                                      cart-line remove + re-index for existing).
                                      stopPropagation keeps it from also switching. */}
                              {/* 2026-09-30 (owner, round 9c — "x buttonu active
                                  pill-in içində olsun"): the delete × lives ONLY
                                  on the ACTIVE pill (round 9b placement, confirmed
                                  by owner). Tap target grew from round 9b's 18px
                                  → 20px circle + 4px padding ≈ 28px press area.
                                  stopPropagation keeps a delete tap from also
                                  switching tabs. Locked (ready/served) pills stay
                                  delete-free (GERİ QAYTAR path). NOTE: round 9c
                                  briefly showed × on every pill — owner rejected
                                  ("onu deməyirəm") and it was reverted. */}
                              {on && !instLocked && (
                                <span
                                  onClick={(e) => { e.stopPropagation(); removeInstance(i); }}
                                  className="relative z-10 shrink-0 p-[4px] -mr-[3px] cursor-pointer"
                                  title="Varyantı sil"
                                >
                                  <span
                                    className="flex items-center justify-center w-[20px] h-[20px] rounded-full"
                                    style={{
                                      /* active pill only → mirror the capsule
                                         contrast (round 9b — light: white ×/black
                                         capsule, dark: dark ×/white capsule) */
                                      color: lightMode ? 'rgba(255,255,255,0.9)' : '#18181b',
                                      backgroundColor: lightMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)',
                                    }}
                                  >
                                    <X size={12} strokeWidth={2.5} />
                                  </span>
                                </span>
                              )}
                                </button>
                              );
                            })}
                             {/* 2026-09-30 (owner, round 9 — "＋ Yeni variant"
                                 end-of-strip pill; round 9b fix — "yeni spec
                                 yaradanda copy edir"): adding a variant belongs right
                                 where the tabs are. Starts as a FRESH HOUSE DEFAULT
                                 spec (exclusive group's is_default / first ₼0 option,
                                 no additive modifiers), NOT a clone of the active
                                 pill. (round-9 A merges identical taps, so a distinct
                                 variant is an explicit action). */}
                             {/* 11n: ALWAYS visible — even when the active pill is
                                 SERVED/READY-locked, "+ Yeni variant" is the way
                                 to add another portion (a fresh, editable draft).
                                 Hiding it (the old `!specLocked` gate) made a
                                 served product a dead end. */}
                             {(
                               <motion.button
                                 onClick={addNewInstance}
                                 whileTap={{ scale: 0.9 }}
                                transition={SPRING}
                                aria-label="Yeni variant əlavə et"
                                title="Yeni variant əlavə et"
                                className="relative z-10 shrink-0 flex items-center justify-center w-[36px] h-[36px] rounded-full grid place-items-center"
                                style={{
                                  color: lightMode ? '#6b7280' : 'rgba(255,255,255,0.55)',
                                  border: `1.5px dashed ${lightMode ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.3)'}`,
                                }}
                              >
                                <Plus size={15} />
                              </motion.button>
                            )}
                          </div>
                      </div>
                    )}
                    {/* 11n (owner: "eyni məhsuldan yenisi əlavə ediləndə həmin
                        məhsula eyni və ya fərqli modifier əlavə etmək mümkün
                        olmalıdır; kilid buna mane olurdu"): SINGLE-mode panels
                        (one line, e.g. SERVED) had no instance strip → no way
                        to add a new portion at all. This dashed pill creates a
                        fresh draft instance alongside the locked one (own
                        modifiers/course/qty — saved as a separate cart line). */}
                    {!multiInst && (
                      <motion.button
                        onClick={addNewInstance}
                        whileTap={{ scale: 0.97 }}
                        transition={SPRING}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider"
                        style={{
                          color: lightMode ? '#6b7280' : 'rgba(255,255,255,0.55)',
                          border: `1.5px dashed ${lightMode ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.3)'}`,
                        }}
                      >
                        <Plus size={14} /> Yeni porsiyon əlavə et
                      </motion.button>
                    )}
                    {/* 2026-09-28 (owner): SERVED/COMPLETED line → spec lock
                        banner; every control below is pointer-events-none + dimmed. */}
                     {specLocked && (
                     <div className={`flex items-center gap-2 p-3 rounded-xl border text-[11px] font-bold ${lightMode ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white/[0.06] border-white/15 text-white/80'}`}>
                       <Lock size={12} className="flex-shrink-0" />
                       {lockLabel === 'Hazır (READY)'
                        ? 'Bu instansiya hazırdır (READY) — spesifikasiya dəyişdirilə bilməz'
                        : 'Bu məhsul verilmişdir (SERVED) — spesifikasiya dəyişdirilə bilməz'}
                     </div>
                   )}
                  {/* Miqdar — 2026-09-25 (owner): GERİ QAYTAR on the RIGHT of
                      the "Miqdar:" label row for served lines (was header
                      top-right, then footer — both rejected). */}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Miqdar:</span>
                    {returnCtx && (
                      <motion.button onClick={(e) => { e.stopPropagation(); startReturn(); }}
                        whileTap={{ scale: 0.96 }} transition={TAP}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-white shadow hover:brightness-105"
                        style={{ backgroundColor: '#3b82f6' }}
                        title={t('return_item') || 'Geri qaytar'}
                      >
                        <RotateCcw size={12} strokeWidth={2.5} /> {t('return_item') || 'Geri qaytar'}
                      </motion.button>
                    )}
                  </div>
                   <div className={`flex items-center gap-3 mt-2 ${specLocked ? 'pointer-events-none opacity-40' : ''}`}>
                     {/* 2026-09-29 (owner: "butonlar cox kohne nesildir — uşunu
                         yenile"): capsule (rounded-full) stepper, Apple current. */}
                     <div className={`flex items-center rounded-full border overflow-hidden ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}>
                      <motion.button onClick={handleQtyMinus} whileTap={{ scale: 0.88 }} transition={TAP}
                        className={`px-6 py-3 text-base font-black ${lightMode ? 'text-zinc-500 hover:bg-zinc-100' : 'text-white hover:bg-white/10'}`}>−</motion.button>
                      <span className={`px-5 py-3 text-base font-black tabular-nums min-w-[3.5rem] text-center ${expandedText}`}>{qty}</span>
                       <motion.button onClick={handleQtyPlus} whileTap={{ scale: 0.88 }} transition={TAP}
                         className={`px-6 py-3 text-base font-black ${lightMode ? 'text-zinc-500 hover:bg-zinc-100' : 'text-white hover:bg-white/10'}`}>+</motion.button>
                    </div>
                  </div>
                </div>

                {/* Variantlar */}
                {(expandedItem.variants?.length ?? 0) > 0 && (
                  <div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('option' as any)}</span>
                    <div className={`flex flex-wrap gap-2 mt-2 ${specLocked ? 'pointer-events-none opacity-40' : ''}`}>
                      {(expandedItem.variants ?? []).map((v: any) => (
                          <motion.button key={v.id} onClick={() => setSelectedVariant(v.id)}
                            whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} transition={SPRING}
                            className={`px-5 py-2.5 rounded-full text-sm font-bold border [transition:background-color_0.2s_ease,border-color_0.2s_ease,color_0.2s_ease] ${selectedVariant === v.id ? 'bg-blue-500 text-white border-blue-500' : lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-100' : 'border-white/10 text-white/80 hover:bg-white/10'}`}>
                            {v.name || v.title || `#${v.id.slice(0, 6)}`} {v.price ? `(+₼${Number(v.price).toFixed(2)})` : ''}
                          </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modifikatorlar */}
                {(expandedItem.modifiers?.length ?? 0) > 0 && (() => {
                  // QF2 P4: render modifier groups when the product has them
                  // (exclusive group max_select=1 behaves as radio; max is
                  // enforced on the + button; min/required shows a hint — the
                  // DB trigger enforce_item_modifiers is the final authority).
                  const groups: any[] = expandedItem.modifier_groups || [];
                  const groupedIds = new Set(groups.flatMap((g: any) => g.item_ids || []));
                  const flatMods: any[] = (expandedItem.modifiers || []).filter((m: any) => !groupedIds.has(m.id));

                  const setModQty = (id: string, q: number, group?: any) => {
                    setSelectedModifiers(prev => {
                      const next = { ...prev };
                      const isExclusive = !!group && Number(group.max_select) === 1;
                      // Exclusive group (max 1): picking one clears the rest,
                      // and the quantity itself is capped at 1 (radio, not stack).
                      if (isExclusive && q > 0) {
                        for (const oid of group.item_ids || []) if (oid !== id) next[oid] = 0;
                      }
                      next[id] = isExclusive ? Math.min(q, 1) : q;
                      return next;
                    });
                  };

                   const renderChip = (m: any, group?: any) => {
                     const mQty = selectedModifiers[m.id] || 0;
                     const isExclusive = !!group && Number(group.max_select) === 1;
                     const maxSelect = group?.max_select != null ? Number(group.max_select) : 0;
                     // Additive: the group cap counts TOTAL quantity across chips.
                     const groupQty = group
                       ? (group.item_ids || []).reduce((s: number, oid: string) => s + (selectedModifiers[oid] || 0), 0)
                       : 0;
                     const maxReached = !isExclusive && maxSelect > 0 && groupQty >= maxSelect;
                     const on = mQty > 0;

                     // EXCLUSIVE (max_select=1, e.g. Serving üslubu): DIRECT
                     // SELECTION — tap selects (radio), tap again deselects.
                     // No count, no +/− (owner 2026-09-22: "servingdə sayı
                     // olur??? birbaşa seçilən olsun").
                     if (isExclusive) {
                       return (
                          <motion.button
                            key={m.id || m.name}
                            onClick={() => setModQty(m.id, on ? 0 : 1, group)}
                            whileHover={{ y: -1.5 }} whileTap={{ scale: 0.94 }} transition={TAP}
                            // 2026-09-29 (owner: "state-machine transition course /
                            // servis üslubu / allergens hamısı üçün"): selection is a
                            // STATE — the fill/border/text crossfade over 200ms
                            // (no hard snap) + capsule shape (current gen).
                            className={`px-4 py-2.5 rounded-full text-sm font-bold border whitespace-nowrap [transition:background-color_0.2s_ease,border-color_0.2s_ease,color_0.2s_ease,box-shadow_0.2s_ease] ${on ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25' : lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'border-white/10 text-white/80 hover:bg-white/5'}`}
                          >
                           {m.name} {m.price ? <span className={on ? 'opacity-80' : 'opacity-50'}>+₼{Number(m.price).toFixed(2)}</span> : ''}
                         </motion.button>
                       );
                     }

                     // ADDITIVE (max>1, e.g. Əlavələr): +/- steppers are
                     // MANDATORY here (owner 2026-09-22: "elavələrdə +/-
                     // mütləkdir"). Name tap also adds 1; −/count/+ control the
                     // quantity. (The serving group above stays direct-select
                     // — it has no quantity.)
                      return (
                        <motion.div key={m.id || m.name} whileHover={{ y: -1.5 }} transition={SPRING}
                          // 2026-09-29 (owner: state-machine transition + "coxx
                          // kohne nesildir" → capsule, current-gen chips):
                          className={`flex items-center gap-1 pl-3.5 pr-1.5 py-1.5 rounded-full text-sm font-bold border [transition:background-color_0.2s_ease,border-color_0.2s_ease,color_0.2s_ease] ${on ? (lightMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-blue-500/10 border-blue-500/40 text-blue-200') : lightMode ? 'border-zinc-200 text-zinc-600' : 'border-white/10 text-white/80'}`}>
                          <span
                            onClick={() => { if (!maxReached) setModQty(m.id, mQty + 1, group); }}
                            className={`whitespace-nowrap select-none active:scale-95 ${maxReached && !on ? 'opacity-40' : 'cursor-pointer'}`}
                          >
                            {m.name} {m.price ? <span className={on ? 'opacity-70' : 'opacity-50'}>+₼{Number(m.price).toFixed(2)}</span> : ''}
                          </span>
                          {/* The − / count pair is a STATE (qty>0) — it pops in
                              with the selection, fades out on the last −. */}
                          <AnimatePresence initial={false}>
                            {on && (
                              <motion.span
                                key="mod-minus-count"
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.12 } }}
                                transition={SPRING}
                                className="flex items-center gap-1"
                              >
                                <motion.button whileTap={{ scale: 0.85 }} transition={TAP}
                                  onClick={() => setModQty(m.id, mQty - 1, group)}
                                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10">−</motion.button>
                                <span className="min-w-[1.1rem] text-center tabular-nums text-xs font-bold">{mQty}</span>
                              </motion.span>
                            )}
                          </AnimatePresence>
                          <motion.button whileTap={{ scale: 0.85 }} transition={TAP}
                            onClick={() => { if (!maxReached) setModQty(m.id, mQty + 1, group); }}
                            disabled={maxReached}
                            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30">+</motion.button>
                        </motion.div>
                      );
                   };

                  return (
                    <div className={`space-y-3 ${specLocked ? 'pointer-events-none opacity-40' : ''}`}>
                      {groups.length > 0 && groups.map((g: any) => {
                        const gItems: any[] = (expandedItem.modifiers || []).filter((m: any) => (g.item_ids || []).includes(m.id));
                        if (gItems.length === 0) return null;
                        const minNeed = Math.max(g.min_select ?? 0, g.is_required ? 1 : 0);
                        const picked = (g.item_ids || []).filter((oid: string) => (selectedModifiers[oid] || 0) > 0).length;
                        return (
                          <div key={g.id}>
                            <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                              {g.name}
                              {Number(g.max_select) === 1 ? ' · 1 seçim' : g.max_select != null ? ` · max ${g.max_select}` : ''}
                              {minNeed > 0 ? ' · məcburi' : ''}
                            </span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {gItems.map((m: any) => renderChip(m, g))}
                            </div>
                            {minNeed > 0 && picked < minNeed && (
                              <p className="text-[11px] mt-1.5 font-semibold" style={{ color: lightMode ? '#18181b' : '#f59e0b' }}>
                                {picked} / {minNeed} — seçilməlidir
                              </p>
                            )}
                          </div>
                        );
                      })}
                      {flatMods.length > 0 && (
                        <div>
                          <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Modifikatorlar:</span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {flatMods.map((m: any) => renderChip(m))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Course (mərhələ) — preserved across re-opens (was lost) */}
                <div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Mərhələ:</span>
                  <div className={`flex flex-wrap gap-2 mt-2 ${specLocked ? 'pointer-events-none opacity-40' : ''}`}>
                     {(['appetizer', 'main', 'dessert', 'drink'] as const).map(val => {
                       // 11n: an untouched course (null) SHOWS the settings
                       // default as active — the auto-assignment is visible in
                       // the editor (the cart chip stays hidden for it).
                       const on = (editCourse ?? defaultCourse) === val;
                      const key = val === 'appetizer' ? 'course_appetizers' : val === 'main' ? 'course_mains' : val === 'dessert' ? 'course_desserts' : 'course_drinks';
                      return (
                          // 2026-09-29 (owner: "kategori active pill qaradır deyə
                          // text oxunmur" → light active is now BLUE, white text —
                          // same selected-state language as variants/modifiers,
                          // readable at small size. Capsule + 200ms state
                          // crossfade (owner: "state-machine transition lazımdır").
                          <motion.button
                            key={val}
                            whileHover={{ y: -1.5 }}
                            whileTap={{ scale: 0.92 }}
                            transition={SPRING}
                             onClick={() => setEditCourse(on ? null : val)}
                             className={`px-4 py-2 rounded-full text-xs font-bold border [transition:background-color_0.2s_ease,border-color_0.2s_ease,color_0.2s_ease] ${on ? (lightMode ? 'bg-blue-500 text-white border-blue-500' : 'bg-amber-400 text-black border-amber-400') : (lightMode ? 'bg-white/60 text-zinc-500 border-zinc-200' : 'bg-white/5 text-white/50 border-white/10')}`}
                          >
                          {t(key as any)}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
                {/* Hold state (read-only badge — hold/resume is managed in the cart) */}
                {editIsHold && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[11px] font-bold ${lightMode ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-orange-500/10 border-orange-500/25 text-orange-300/90'}`}>
                    <Pause size={11} /> Saxlanılıb (hold)
                  </span>
                )}

                 {/* 2026-09-29 (owner: "qeyd ilə allergens yerini dəyiş"):
                     ALLERGENS now sit BEFORE QEYD — allergy flags are a spec
                     decision (with the modifiers), the free-text note closes
                     the form. Tapping flags the allergen on THIS instance
                     (customer allergy warning → kitchen); stored in
                     order_items.allergens, re-loaded when re-opened. */}
                 {(() => {
                   const allergenList = parseAllergens(expandedItem.allergens);
                   if (allergenList.length === 0) return null;
                   return (
                     <div>
                       <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Allergenlər:</span>
                       <div className={`flex items-center gap-1.5 flex-wrap mt-2 ${specLocked ? 'pointer-events-none opacity-40' : ''}`}>
                         {allergenList.map((a: any) => {
                           const def = resolveAllergenEntry(a);
                           const Icon = def?.icon ?? ALLERGEN_FALLBACK_ICON;
                           const code = def?.code || (a && typeof a === 'object' ? (String(a.code || a.name || '')) : String(a));
                           if (!code) return null;
                           const on = selectedAllergens.includes(code);
                           return (
                             <motion.button
                               key={code}
                               whileHover={{ y: -1.5 }} whileTap={{ scale: 0.94 }} transition={TAP}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setSelectedAllergens(prev => on ? prev.filter(x => x !== code) : [...prev, code]);
                               }}
                                /* Touch-friendly (owner 2026-09-22): the old
                                   px-2/py-0.5/text-[10px] pill was a 16px tap
                                   hole. 2026-09-29: capsule + 200ms state
                                   crossfade. 2026-09-30 (round 10, E2E
                                   diagnostic — "Allergens bölməsində bug"):
                                   the chip now speaks the SAME language as the
                                   sibling MƏRHƏLƏ/SERVİNQ chips (px-4 py-2.5,
                                   text-sm, UNFILLED resting state — the old
                                   solid bg-zinc-100 fill made the row look
                                   greener/chunkier: 38px vs 34px, grey vs
                                   transparent). */
                                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border text-sm font-bold [transition:background-color_0.2s_ease,border-color_0.2s_ease,color_0.2s_ease,box-shadow_0.2s_ease] ${on ? 'bg-red-500/15 border-red-500/60 text-red-500 shadow-lg shadow-red-500/10' : lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'border-white/10 text-white/80 hover:bg-white/5'}`}
                              >
                                 <Icon size={15} /> {def?.label || (a && typeof a === 'object' ? (a.name || code) : code)}
                                  {/* 2026-09-30 (round 10, E2E diagnostic — "tick
                                      işarəsində bug"): the framer motion.path rig was
                                      DEAD — the dasharray snapped 0→1 with zero
                                      tween (the tick hard-popped before the chip
                                      finished turning red, and vanished instantly on
                                      unselect). The draw is now NATIVE SVG + a CSS
                                      transition: pathLength=1 normalizes the path,
                                      strokeDasharray 1 + strokeDashoffset 1→0 draws
                                      left→vertex→right (~280ms, 60ms delay so the
                                      red state leads), quick un-draw+fade on
                                      deselect. The 14px slot stays PERSISTENT
                                      (round 7: zero layout shift). CSS transitions
                                      can't remount-flash — the tick state is purely
                                      attribute-driven. */}
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
                                    <path
                                      d="M4 12.5 L9.5 18 L20 6.5"
                                      pathLength={1}
                                      stroke="currentColor"
                                      strokeWidth={3.4}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      style={{
                                        strokeDasharray: 1,
                                        strokeDashoffset: on ? 0 : 1,
                                        opacity: on ? 1 : 0,
                                        transition: on
                                          ? 'stroke-dashoffset 0.28s ease-out 0.06s, opacity 0.08s ease'
                                          : 'stroke-dashoffset 0.14s ease, opacity 0.12s ease',
                                      }}
                                    />
                                  </svg>
                             </motion.button>
                           );
                         })}
                       </div>
                     </div>
                   );
                 })()}

                  {/* Qeyd — now AFTER allergens (owner 2026-09-29 swap).
                      2026-09-30 (round 10, owner reference = the cart's
                      "Qeyd əlavə et" pill): the square input is GONE. The
                      resting state is a rounded-full pill (Tag icon +
                      "Qeyd əlavə et" or the note text); tapping it morph-opens
                      the floating editor over the virtual keyboard (portal at
                      the component root — see createPortal below). */}
                  <div className={specLocked ? 'pointer-events-none opacity-40' : ''}>
                    <span className={`text-xs font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Qeyd:</span>
                    {/* 2026-09-30 (round 10c): the pill NEVER unmounts — it is
                        the tracked anchor of the manual spring morph. While the
                        card is up it sits at opacity 0 (layout intact, rect live-
                        trackable via getBoundingClientRect every frame); the card
                        unmounts only on landing, when it exactly IS the pill's
                        rect — so the handoff is invisible (no pop, no ghost). */}
                    <motion.button
                      ref={notePillRef}
                      onClick={() => { if (!specLocked) openNoteEditor(); }}
                      whileTap={{ scale: 0.97 }} transition={TAP}
                      disabled={specLocked || noteEditorOpen}
                      className={`mt-2 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border text-xs font-bold ${noteEditorOpen ? 'opacity-0 pointer-events-none' : ''} ${noteForProduct ? (lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-700' : 'bg-white/8 border-white/15 text-white/85') : (lightMode ? 'bg-transparent border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'bg-transparent border-white/10 text-white/40 hover:bg-white/5')}`}
                    >
                      <Tag size={12} />
                      <span className="truncate max-w-[260px]">{noteForProduct || t('add_note')}</span>
                    </motion.button>
                  </div>
              </div>

                {/* Footer: ƏLAVƏ ET full-width — sticky (flex-shrink-0).
                    2026-09-25 (owner): GERİ QAYTAR moved to the modal
                    TOP-RIGHT (header) for served lines. */}
                <div className="p-5 pt-0 flex-shrink-0">
                  {/* 2026-09-30 (owner, round 9): the "＋ Yeni variant" control
                      moved to the END OF THE PILL STRIP (top of the editor) —
                      adding a variant belongs right where the variant tabs are,
                      not down in the CTA. See addNewInstance + the strip below. */}
                  {/* 2026-09-28 (owner): SERVED lock — the CTA is inert while
                      the spec is frozen; only GERİ QAYTAR remains actionable. */}
                    <motion.button
                      onClick={() => { if (!specLocked) handleModalAdd(); }}
                      whileHover={specLocked ? undefined : { y: -2 }} whileTap={specLocked ? undefined : { scale: 0.97 }} transition={SPRING}
                      disabled={specLocked}
                      className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg ${specLocked ? 'cursor-not-allowed' : 'text-white hover:brightness-105'}`}
                    style={{ backgroundColor: specLocked ? (lightMode ? '#d4d4d8' : 'rgba(255,255,255,0.12)') : '#10b981', color: specLocked ? (lightMode ? '#71717a' : 'rgba(255,255,255,0.5)') : undefined }}
                    >
                      {specLocked
                        ? <><Lock size={16} /> {lockLabel} — qəfəslənib</>
                        : multiInst
                          // Multi-instance save = "Yadda saxla" (the rows exist;
                          // we're editing instances, not adding a product).
                          ? <><Check size={18} /> Yadda saxla{multiTotalUnits > 1 ? ` · ${multiTotalUnits}` : ''}</>
                          : <><Plus size={18} /> {t('add')}{qty > 1 ? ` · ${qty}` : ''}</>}
                    </motion.button>
                </div>
                </motion.div>
                )}
                </AnimatePresence>
             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>

       {/* 2026-09-24 (owner, FINAL): PIN gate for the in-panel return flow —
           verified → the panel morphs into the return view. */}
       <PinGuard
         open={returnPinOpen}
         onClose={() => setReturnPinOpen(false)}
         onVerified={(v: any) => {
           setReturnPinOpen(false);
           if (v?.valid) setReturnView(true);
         }}
          action="void_item"
        />
      </div>

      {/* 2026-09-30 (round 10c — manual spring morph): the note editor IS the
          Qeyd pill's shape, carried by a single fixed element whose
          left/top/width/height/border-radius are integrated per rAF frame
          (see stepNoteMorph above). Entry target = viewport-centered card
          riding the LIVE --vk-height; exit target = the pill's LIVE rect.
          Portals to document.body because the modal lives in a transformed
          (scaled) container where `fixed` children would be trapped.
          autofocus → VKB opens in parallel; × / Ləğv / Təsdiqlə / backdrop /
          ✓ / GİZLƏ / Escape → closeNoteEditor() (card morphs home to the pill
          while the keyboard collapses — they move as one body). */}
      {createPortal(
        <>
          {/* The backdrop fades independently (AnimatePresence). The CARD is
              deliberately OUTSIDE it: on landing the card must unmount
              IMMEDIATELY (it is the pill's exact rect at that moment — keeping
              it mounted for the backdrop's 0.3s exit fade would leave a static
              pill-identical duplicate on screen; E2E v4: 603ms conv→unmount).
              The veil fades behind the revealed pill instead. */}
          <AnimatePresence>
            {noteEditorOpen && (
              <motion.div
                key="prod-note-backdrop"
                className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9998]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
                onClick={closeNoteEditor}
              />
            )}
          </AnimatePresence>
          {/* 2026-09-30 (round 10b — owner: "popup-un UI-sini bəyənmirəm,
              daha qəşəng"): SINGLE-SURFACE card. The old design had a
              double surface (card box + inner textarea box with a 2px
              emerald focus border + 2px .vk-active ring = a "4px green
              box", the heaviest element in the card) + a cramped two-line
              header on a hairline + a dead band over small buttons. Now:
              the card IS the field — one surface, no inner box, no ring
              (the dimmed backdrop already signals "this is the active
              layer"), quiet one-line header, generous type, full-height
              actions. Geometry (left/top/width/height/borderRadius) is
              driven ENTIRELY by the rAF spring loop — no layoutId, no framer
              projection, no re-layout beats; the initial style block is
              overwritten pre-paint by the mount-frame layoutEffect. */}
          {noteEditorOpen && (
            <div
              ref={noteCardRef}
                className={`fixed z-[10003] overflow-hidden border shadow-elevated backdrop-blur-xl ${lightMode ? 'bg-white/[0.97] border-zinc-200/80' : 'bg-[#1D1D24]/[0.98] border-white/10'}`}
                style={{ left: -9999, top: -9999, width: 0, height: 0 }}
              >
                <style>{`.prod-qeyd-ta.vk-active { box-shadow: none !important; }`}</style>
                {/* content: the rAF morph loop drives its opacity (fades in
                    after the shape grows, fades out fast on the way home). */}
                <div
                  ref={noteContentRef}
                  className="flex flex-col"
                  style={{ opacity: 0 }}
                >
                  {/* header — one quiet line, no hairline, no icon box */}
                  <div className="flex items-center gap-2 pl-5 pr-3 pt-4">
                    <Tag size={15} className={lightMode ? 'text-emerald-600' : 'text-emerald-400'} />
                    <span className={`flex-1 text-xs font-black uppercase tracking-widest ${lightMode ? 'text-zinc-700' : 'text-white/80'}`}>Məhsul qeydi</span>
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={closeNoteEditor}
                      aria-label="Bağla"
                      className={`w-8 h-8 -mr-1 rounded-full flex items-center justify-center transition-colors ${lightMode ? 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600' : 'text-white/40 hover:bg-white/10 hover:text-white/70'}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {/* field — borderless, ringless, auto-grows (E2E bug #8:
                      fixed 243px with internal scroll → the card now grows
                      with the text up to 160px, then scrolls) */}
                  <div className="px-5 pt-1.5 pb-1">
                    <textarea
                      ref={noteEditorRef}
                      // 2026-09-30 (round 10c-v2): NO autoFocus attribute — it
                      // focused synchronously in the COMMIT frame, mounting the
                      // whole VKB (~30 keys + RO + CSS) in the same tick as the
                      // card (E2E: 70–140ms before the card's first paint). The
                      // rAF caret effect below focuses on the NEXT frame instead:
                      // the card's entry starts clean, the keyboard rides in 1
                      // frame later (imperceptible), and the caret-at-end fix
                      // (E2E bug #3) still applies.
                      value={noteForProduct}
                      onChange={(e) => {
                        setNoteForProduct(e.target.value);
                        const el = e.currentTarget;
                        el.style.height = 'auto';
                        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          // Matches the VKB's own ↵ semantics (textarea = newline).
                          // Closing is ✓ done / Escape / × / Təsdiqlə / backdrop.
                          e.preventDefault();
                          const el = noteEditorRef.current;
                          if (el) {
                            const s = el.selectionStart ?? noteForProduct.length;
                            const en = el.selectionEnd ?? noteForProduct.length;
                            setNoteForProduct(noteForProduct.slice(0, s) + '\n' + noteForProduct.slice(en));
                            requestAnimationFrame(() => {
                              try {
                                el.setSelectionRange(s + 1, s + 1);
                                el.style.height = 'auto';
                                el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                              } catch {}
                            });
                          }
                          return;
                        }
                        if (e.key === 'Escape') {
                          // E2E bug #4: Escape used to close the popup AND the
                          // whole product editor (the modal's own Escape
                          // listener still fired). stopPropagation contains it.
                          e.preventDefault();
                          e.stopPropagation();
                          closeNoteEditor();
                        }
                      }}
                      placeholder={t('note_placeholder') || 'Qeyd...'}
                      rows={2}
                      className={`prod-qeyd-ta w-full bg-transparent text-[15px] leading-relaxed resize-none focus:outline-none min-h-[52px] max-h-[160px] ${lightMode ? 'text-gray-900 placeholder:text-zinc-400' : 'text-white placeholder:text-white/25'}`}
                    />
                  </div>
                  {/* actions — Ləğv et only when there is text to clear */}
                  <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-2">
                    {noteForProduct ? (
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setNoteForProduct(''); requestAnimationFrame(() => { const el = noteEditorRef.current; if (el) { el.style.height = 'auto'; el.focus(); try { el.setSelectionRange(0, 0); } catch {} } }); }}
                        className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${lightMode ? 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600' : 'text-white/50 hover:bg-white/8 hover:text-white/80'}`}
                      >
                        Ləğv et
                      </button>
                    ) : <span />}
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={closeNoteEditor}
                      className="px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-emerald-500 text-[#04211a] hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-colors"
                    >
                      Təsdiqlə
                    </button>
                  </div>
                </div>
              </div>
          )}
        </>,
        document.body
      )}
    </>
    );
  });