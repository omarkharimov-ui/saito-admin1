'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Delete, CornerDownLeft, Check } from '@/components/ui/saito-icons';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

type KeyMode = 'numeric' | 'text';

interface KeyDef {
  label?: string;
  value?: string;
  action?: 'backspace' | 'clear' | 'space' | 'enter' | 'shift' | 'done';
  wide?: boolean;
}

const NUMERIC_ROWS: KeyDef[][] = [
  [{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }],
  [{ label: '4', value: '4' }, { label: '5', value: '5' }, { label: '6', value: '6' }],
  [{ label: '7', value: '7' }, { label: '8', value: '8' }, { label: '9', value: '9' }],
  [{ label: '.', value: '.' }, { label: '0', value: '0' }, { action: 'backspace' }],
];

const QWERTY_ROWS: KeyDef[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map(c => ({ label: c, value: c })),
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'].map(c => ({ label: c, value: c })),
  [
    { action: 'shift', label: '⇧' },
    ...['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(c => ({ label: c, value: c })),
    { action: 'backspace' },
  ],
];

interface VirtualKeyboardContextValue {
  close: () => void;
  isOpen: boolean;
  mode: KeyMode;
  height: number;
}

const VirtualKeyboardContext = createContext<VirtualKeyboardContextValue | null>(null);

export function useVirtualKeyboard() {
  const ctx = useContext(VirtualKeyboardContext);
  if (!ctx) throw new Error('useVirtualKeyboard must be used within VirtualKeyboardProvider');
  return ctx;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function detectMode(target: EventTarget | null): KeyMode | 'none' {
  if (!target || !(target instanceof HTMLElement)) return 'none';
  const tag = target.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return 'none';
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type || 'text';
    if (['checkbox', 'radio', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'file', 'range', 'hidden'].includes(type)) return 'none';
  }
  const dataMode = target.getAttribute('data-vk');
  if (dataMode === 'numeric' || dataMode === 'text') return dataMode;
  if (dataMode === 'none') return 'none';
  const type = tag === 'INPUT' ? ((target as HTMLInputElement).type || 'text') : 'text';
  if (type === 'number' || type === 'tel') return 'numeric';
  return 'text';
}

export function VirtualKeyboardProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [activeEl, setActiveEl] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<KeyMode>('text');
  const [shift, setShift] = useState(false);
  const [height, setHeight] = useState(0);
  const keyboardRef = useRef<HTMLDivElement | null>(null);
  const activeElRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!activeEl) {
      setHeight(0);
      return;
    }
    const el = keyboardRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeEl, mode]);

  useEffect(() => {
    document.documentElement.style.setProperty('--vk-height', `${height}px`);
    return () => { document.documentElement.style.removeProperty('--vk-height'); };
  }, [height]);

  const close = useCallback(() => {
    setActiveEl(null);
    setShift(false);
  }, []);

  const insertText = useCallback((el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setNativeValue(el, next);
    const pos = start + text.length;
    requestAnimationFrame(() => {
      try { el.setSelectionRange(pos, pos); } catch {}
    });
  }, []);

  const handleKeyPress = useCallback((k: KeyDef) => {
    const el = activeElRef.current;
    if (!el) return;

    if (k.action === 'done') {
      close();
      return;
    }
    if (k.action === 'enter') {
      if (el.tagName === 'TEXTAREA') {
        insertText(el, '\n');
        return;
      }
      close();
      el.blur();
      return;
    }
    if (k.action === 'backspace') {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      if (start === end && start > 0) {
        const next = el.value.slice(0, start - 1) + el.value.slice(end);
        setNativeValue(el, next);
        const pos = start - 1;
        requestAnimationFrame(() => {
          el.focus();
          try { el.setSelectionRange(pos, pos); } catch {}
        });
      } else if (start !== end) {
        const next = el.value.slice(0, start) + el.value.slice(end);
        setNativeValue(el, next);
        requestAnimationFrame(() => {
          el.focus();
          try { el.setSelectionRange(start, start); } catch {}
        });
      }
      return;
    }
    if (k.action === 'clear') {
      setNativeValue(el, '');
      return;
    }
    if (k.action === 'space') {
      insertText(el, ' ');
      return;
    }
    if (k.action === 'shift') {
      setShift(s => !s);
      return;
    }
    if (k.value !== undefined) {
      insertText(el, shift ? k.value.toUpperCase() : k.value);
    }
  }, [close, insertText, shift]);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const m = detectMode(e.target);
      if (m === 'none') {
        close();
        return;
      }
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      activeElRef.current = target;
      setActiveEl(target);
      setMode(m);
      setTimeout(() => {
        try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
      }, 150);
    };
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, [close]);

  // QF (yellow #2): no full-screen backdrop — it sat ABOVE modals (z-998 >
  // z-125) and swallowed their clicks (gift-card confirm blocked once).
  // Auto-close when focus leaves inputs/textarea entirely (button clicks
  // already close via the focusin 'none' branch).
  useEffect(() => {
    const onFocusOut = () => {
      requestAnimationFrame(() => {
        const el = activeElRef.current;
        // 2026-09-26 (Task 55, verify55): the focused element was UNMOUNTED
        // (e.g. POS mode switch tears the panel down) — focusout is unreliable
        // in that path, so close on detachment explicitly.
        if (el && !el.isConnected) { activeElRef.current = null; setActiveEl(null); return; }
        const a = document.activeElement;
        if (!a || (a !== document.body && !a.classList.contains('vk-active') && !(a instanceof HTMLInputElement) && !(a instanceof HTMLTextAreaElement))) setActiveEl(null);
      });
    };
    document.addEventListener('focusout', onFocusOut);
    return () => document.removeEventListener('focusout', onFocusOut);
  }, []);

  // 2026-09-26 (Task 55, verify55 item 5): DETACHED-ELEMENT GUARD. When the
  // panel holding the focused input unmounts (mode switch İÇƏRİDƏ ⇄ TAKEAWAY
  // ⇄ ÇATDIRILMA), Chrome does not always fire focusout and the keyboard
  // stayed open, blocking the screen (reproduced in verification: activeElement
  // === body but VKB still rendered). While the keyboard is open, poll a cheap
  // isConnected check — detached input = close.
  useEffect(() => {
    if (!activeEl) return;
    const id = setInterval(() => {
      const el = activeElRef.current;
      if (el && !el.isConnected) {
        activeElRef.current = null;
        setActiveEl(null);
      }
    }, 300);
    return () => clearInterval(id);
  }, [activeEl]);

  // QA bug 8 (2026-09-22): the focusout auto-close was not reliable on every
  // interaction path (some taps never move document.activeElement), so the
  // keyboard stayed open and blocked ~40% of the view. An outside pointerdown
  // (any tap/click not on the keyboard and not on an input) now ALWAYS closes
  // it, regardless of focus behavior.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-vk-panel]')) return;      // tap on the keyboard itself
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return; // tap on an input (re)opens
      if (activeElRef.current) setActiveEl(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  useEffect(() => {
    highlightRef.current?.classList.remove('vk-active');
    if (activeEl) {
      activeEl.classList.add('vk-active');
      highlightRef.current = activeEl;
    } else {
      highlightRef.current = null;
    }
  }, [activeEl]);

  useEffect(() => {
    return () => {
      highlightRef.current?.classList.remove('vk-active');
    };
  }, []);

  // 2026-09-27 (owner: "klaviaturanın ümumi stilini yenilə — Apple üslubundan
  // ilhamlanan, müasir, səliqəli, canlı"): Apple keycap language — light
  // theme = white keycaps on a soft-gray plate; dark = frosted white/15
  // keycaps. The done key is EMERALD (the single accent; the old amber key
  // violated the no-yellow-accent doctrine). Press feedback = scale + the
  // keycap brightening, like iOS.
  const keyBase = 'touch-none select-none rounded-[12px] flex items-center justify-center font-bold transition-[transform,background-color,filter] duration-100';
  const keyNormal = lightMode ? 'bg-white text-zinc-900 shadow-[0_1px_1px_rgba(0,0,0,0.06)]' : 'bg-white/[0.16] text-white';
  const keyCtrl = lightMode ? 'bg-zinc-300/80 text-zinc-800' : 'bg-white/[0.09] text-white/80';
  const keyDone = 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25';

  const renderKey = (k: KeyDef) => {
    const isDone = k.action === 'done';
    const isCtrl = k.action === 'backspace' || k.action === 'clear' || k.action === 'shift' || k.action === 'enter';
    const label = k.label !== undefined && k.action === undefined ? (shift ? k.label.toUpperCase() : k.label) : (k.label ?? '');
    return (
      <motion.button
        key={k.action ?? k.value}
        whileTap={{ scale: 0.92, filter: 'brightness(1.18)' }}
        onPointerDown={(e) => { e.preventDefault(); }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleKeyPress(k); }}
        className={`${keyBase} ${k.wide ? 'flex-[2]' : 'flex-1'} ${
          isDone ? keyDone : isCtrl ? keyCtrl : keyNormal
        }`}
        style={{ height: 52 }}
      >
        {/* QA bug 8 (2026-09-22): the "done" key used the SAME 'Gizlə' label as
            the header button (two identical buttons on screen). It is now a
            distinct checkmark; the header keeps the word "Gizlə". */}
        {k.action === 'backspace' ? <Delete size={19} /> : k.action === 'enter' ? <CornerDownLeft size={19} /> : k.action === 'done' ? <Check size={19} /> : label}
      </motion.button>
    );
  };

  // 2026-09-27 (owner: "klaviatura blur qatının və modalın ARXASINDA açılır"):
  // the slide-in transform used to live on a WRAPPER div around the fixed
  // bar — a transformed ancestor becomes the containing block AND stacking
  // context for the fixed child, so during the ~280ms entry the bar's
  // z-[10002] was trapped inside a z-auto wrapper and painted UNDER the
  // modal/backdrop (it "jumped" in front only after the transform cleared).
  // Fix: the fixed+z element IS the motion element — its own transform never
  // demotes it. (2026-09-25: z 10002 sits above the z-[10001] PIN/Refund/
  // Void modal backdrops; it is a bottom bar, not a full-screen layer.)
  const keyboard = activeEl ? (
    <motion.div
      ref={keyboardRef}
      key="vk-keyboard"
      initial={{ y: 400 }}
      animate={{ y: 0 }}
      exit={{ y: 400 }}
      transition={{ duration: 0.28, ease: [0.45, 0, 0.55, 1] }}
      data-vk-panel
      className={`fixed bottom-0 left-0 right-0 z-[10002] p-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)] shadow-elevated backdrop-blur-xl ${
        lightMode ? 'bg-[#D8D9DD]/95 border-t border-black/10' : 'bg-[#1B1B21]/95 border-t border-white/10'
      }`}
    >
      {/* 2026-09-27 (E2E: "GİZLƏ pill MISSING"): minimal header restored —
          a quiet grabber + the labeled GİZLƏ close pill (the ✓ key alone
          was an unlabeled icon, unclear affordance). */}
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <span className={`w-8 h-1 rounded-full ${lightMode ? 'bg-black/15' : 'bg-white/20'}`} />
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => close()}
          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${lightMode ? 'bg-black/10 text-zinc-700 hover:bg-black/15' : 'bg-white/10 text-white/70 hover:bg-white/15'}`}
        >
          {t('hide')}
        </button>
      </div>
      <div className="w-full max-w-[900px] mx-auto">
        {mode === 'numeric' ? (
          <div className="max-w-[520px] mx-auto">
            {NUMERIC_ROWS.map((row, ri) => (
              <div key={ri} className="grid grid-cols-3 gap-1.5 mb-1.5">
                {row.map(renderKey)}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <motion.button
                onPointerDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleKeyPress({ action: 'clear', label: t('clear') }); }}
                whileTap={{ scale: 0.94, filter: 'brightness(1.15)' }}
                className={`${keyBase} ${keyCtrl} flex-1 text-xs font-bold uppercase tracking-wider`}
                style={{ height: 52 }}
              >
                {t('clear')}
              </motion.button>
              {renderKey({ action: 'done', label: t('hide') })}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-10 gap-1.5">
              {QWERTY_ROWS[0].map(renderKey)}
            </div>
            <div className="grid grid-cols-9 gap-1.5">
              {QWERTY_ROWS[1].map(renderKey)}
            </div>
            <div className="grid grid-cols-9 gap-1.5">
              {QWERTY_ROWS[2].map(renderKey)}
            </div>
            <div className="flex gap-1.5 pt-1">
              {renderKey({ action: 'done', label: t('hide') })}
              {renderKey({ action: 'space', label: 'Space', wide: true })}
              {renderKey({ action: 'enter' })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  ) : null;

  return (
    <VirtualKeyboardContext.Provider value={{ close, isOpen: !!activeEl, mode, height }}>
      {children}
      {/* 2026-09-27 (doctrine: no yellow accent — emerald focus): the
          active-input ring was amber (rgba(245,158,11)); now emerald. */}
      <style>{`.vk-active { box-shadow: 0 0 0 2px ${lightMode ? 'rgba(5,150,105,0.75)' : 'rgba(16,185,129,0.85)'} !important; }`}</style>
      <AnimatePresence>
        {keyboard}
      </AnimatePresence>
    </VirtualKeyboardContext.Provider>
  );
}
