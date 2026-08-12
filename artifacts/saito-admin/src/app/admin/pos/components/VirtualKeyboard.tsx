'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fastExit } from '@/lib/modal-transitions';
import { Delete, CornerDownLeft, Keyboard } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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

  const renderKey = (k: KeyDef) => {
    const isDone = k.action === 'done';
    const isCtrl = k.action === 'backspace' || k.action === 'clear' || k.action === 'shift' || k.action === 'enter';
    const label = k.label !== undefined && k.action === undefined ? (shift ? k.label.toUpperCase() : k.label) : (k.label ?? '');
    return (
      <motion.button
        key={k.action ?? k.value}
        whileTap={{ scale: 0.9 }}
        onPointerDown={(e) => { e.preventDefault(); }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleKeyPress(k); }}
        className={`touch-none select-none rounded-xl border flex items-center justify-center font-bold transition-colors ${
          k.wide ? 'flex-[2]' : 'flex-1'
        } ${isDone
          ? 'bg-amber-500 border-amber-400 text-white'
          : isCtrl
            ? 'bg-zinc-700/80 border-zinc-600/60 text-white/90'
            : 'bg-zinc-800 border-zinc-700/50 text-white'}`}
        style={{ height: 54 }}
      >
        {k.action === 'backspace' ? <Delete size={20} /> : k.action === 'enter' ? <CornerDownLeft size={20} /> : label}
      </motion.button>
    );
  };

  const keyboard = activeEl && (
    <div ref={keyboardRef} className="fixed bottom-0 left-0 right-0 z-[9999] bg-[#1E1E24]/95 border-t border-white/10 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-elevated backdrop-blur-2xl">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-white/30">
          <Keyboard size={12} />
          Virtual Keyboard
        </div>
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => close()}
          className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest bg-white/10 text-white/70 hover:bg-white/15 active:scale-95 transition-all"
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
              <button
                onPointerDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleKeyPress({ action: 'clear', label: t('clear') }); }}
                className="h-[54px] rounded-xl border border-zinc-700/50 bg-zinc-800 text-white/70 text-xs font-bold uppercase tracking-wider active:scale-95 transition-transform"
              >
                {t('clear')}
              </button>
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
    </div>
  );

  return (
    <VirtualKeyboardContext.Provider value={{ close, isOpen: !!activeEl, mode, height }}>
      {children}
      <style>{'.vk-active { box-shadow: 0 0 0 2px rgba(245,158,11,0.9) !important; }'}</style>
      <AnimatePresence>
        {activeEl && (
          <motion.div
            key="vk-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fastExit}
            className="fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm"
            onPointerDown={close}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {keyboard && (
          <motion.div
            key="vk-keyboard"
            initial={{ y: 320 }}
            animate={{ y: 0 }}
            exit={{ y: 320 }}
            transition={fastExit}
          >
            {keyboard}
          </motion.div>
        )}
      </AnimatePresence>
    </VirtualKeyboardContext.Provider>
  );
}
