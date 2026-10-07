'use client';

// 13i → 13o — "Tədarük" zone. INTERNAL PILL TABS (owner 13o:
// "bəzilərini tab-da olsun, hamısı alt-alta düzgün olar").
// The ZONE stays on the single scroll page (no zone remount); only the tab
// content swaps — instant, fade-only (13m: no y-slide).
//   Nə Alım · Faktura · Sifarişlər (elev) · Tədarükçülər
// (13l's stacked sections returned as tabs; the zone hero stays data-driven.)

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ShoppingCart, ArrowDownCircle } from '@/components/ui/saito-icons';
import { Seg, fmtNum } from '../stock-ui';
import type { StockSuggestion } from '@/types/inventory';
import TabHero from './TabHero';
import { ViewContent } from './ViewFrame';
import OrderGuideSection from './OrderGuideSection';
import InvoiceUploadSection from './InvoiceUploadSection';
import PurchaseOrdersPage from '../../purchase-orders/purchase-orders-content';
import SuppliersSection from './SuppliersSection';

const URG: Record<string, { label: string; cls: string; light: string }> = {
  critical: { label: 'Kritik', cls: 'bg-rose-500/15 border-rose-500/30 text-rose-400', light: 'bg-rose-500/10 border-rose-500/30 text-rose-600' },
  high:     { label: 'Yüksək', cls: 'bg-orange-500/15 border-orange-500/30 text-orange-400', light: 'bg-orange-500/10 border-orange-500/30 text-orange-600' },
  medium:   { label: 'Orta',   cls: 'bg-amber-500/15 border-amber-500/30 text-amber-400', light: 'bg-amber-500/10 border-amber-500/30 text-amber-600' },
  low:      { label: 'Aşağı',  cls: 'bg-blue-500/15 border-blue-500/30 text-blue-400', light: 'bg-blue-500/10 border-blue-500/30 text-blue-600' },
};

const TABS: { id: string; label: string; elevated?: boolean }[] = [
  { id: 'buy', label: 'Nə Alım' },
  { id: 'invoice', label: 'Faktura' },
  { id: 'orders', label: 'Sifarişlər', elevated: true },
  { id: 'suppliers', label: 'Tədarükçülər' },
];

interface Props {
  sub: string;
  onSubChange: (s: string) => void;
  isElevated: boolean;
  lightMode: boolean;
  /** legacy deep-link ingredient id (old "Sifariş et" links) */
  deepIngredient?: string | null;
}

export default function ProcurementHub({ sub, onSubChange, isElevated, lightMode, deepIngredient }: Props) {
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSelect, setAutoSelect] = useState<string | null>(deepIngredient ?? null);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, nRes] = await Promise.all([
        fetch('/api/stock/suggestions'),
        fetch('/api/notifications?type=stock&limit=20').catch(() => null),
      ]);
      if (sRes.ok) setSuggestions((await sRes.json()).suggestions ?? []);
      if (nRes && nRes.ok) setNotifs(await nRes.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  // 13o: gated tabs (elevated) disappear post-auth for lower roles →
  // switch the active tab to the first visible one (URL rewrites too).
  const visible = TABS.filter(t => !t.elevated || isElevated);
  const active = visible.some(t => t.id === sub) ? sub : visible[0].id;
  useEffect(() => {
    if (active !== sub) onSubChange(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const criticalCount = suggestions.filter(s => s.urgency === 'critical').length;
  const estCost = suggestions.reduce((a, s) => a + (s.suggested_reorder_qty * s.avg_cost_per_unit || 0), 0);

  const hero = criticalCount > 0
    ? { tone: 'critical' as const, title: `${suggestions.length} xammal sifariş olunmalı`, sub: `Təxmini xərc ₼${fmtNum(estCost)} — Nə Alım-da sətir seçib DRAFT PO yarat (auto-send YOX).` }
    : suggestions.length > 0
      ? { tone: 'warning' as const, title: `${suggestions.length} xammal limitə yaxınlaşıb`, sub: 'Hələ kritik deyil — Nə Alım-dan izləyin.' }
      : { tone: 'ok' as const, title: 'Hazırki sifariş tələbi yoxdur', sub: 'Bütün xammallar par səviyyəsində və ya yuxarısındadır.' };

  return (
    <ViewContent id="proc">
      <div className="space-y-5">
        <TabHero tone={hero.tone} title={hero.title} sub={hero.sub} lightMode={lightMode} />

        <Seg
          layoutId="seg-pill-proc"
          options={visible.map(t => ({ id: t.id, label: t.label }))}
          value={active}
          onChange={onSubChange}
        />

        <motion.div
          key={active}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          {/* ── Nə Alım: two columns — owner 13k: "soldan tekliflər, sağda lazım olanlar" ── */}
          {active === 'buy' && (loading ? (
            <div className="flex items-center justify-center py-10 text-[var(--theme-text-muted)]">
              <RefreshCw size={20} className="animate-spin" />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
              {/* LEFT: Təkliflər (suggestions + auto-order notifications) */}
              <div className="space-y-5 min-w-0">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Təkliflər</p>
                    <button onClick={load} className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors">
                      <RefreshCw size={12} /> Yenilə
                    </button>
                  </div>
                  {suggestions.length === 0 ? (
                    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] py-8 px-4 text-center">
                      <div className="w-10 h-10 mx-auto rounded-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-muted)] mb-2.5">
                        <ShoppingCart size={18} />
                      </div>
                      <p className="text-sm font-bold text-[var(--theme-text)]">Sifariş tələbi yoxdur</p>
                      <p className="text-[11px] text-[var(--theme-text-muted)] mt-1">Bütün xammallar par səviyyəsində və ya yuxarısındadır.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suggestions.map((s, i) => {
                        const u = URG[s.urgency] || URG.low;
                        return (
                          <motion.div key={s.ingredient_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                            className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 hover:border-[var(--theme-text)]/30 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-[13px] font-bold text-[var(--theme-text)] truncate">{s.ingredient_name}</p>
                                  <span className={`shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${lightMode ? u.light : u.cls}`}>{u.label}</span>
                                </div>
                                <p className="text-[11px] text-[var(--theme-text-muted)] mt-0.5 truncate">
                                  {s.current_stock} {s.unit} stokda{s.daily_consumption_rate ? ` · ${Number(s.daily_consumption_rate).toFixed(1)}/gün` : ''}{s.days_remaining != null ? ` · ${Math.max(0, Number(s.days_remaining)).toFixed(0)}g qalıb` : ''}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[13px] font-black tabular-nums text-[var(--theme-text)]">+{s.suggested_reorder_qty} {s.unit}</p>
                                <p className="text-[10px] text-[var(--theme-text-muted)] tabular-nums">₼{((s.suggested_reorder_qty * s.avg_cost_per_unit) || 0).toFixed(0)}</p>
                              </div>
                              <button
                                onClick={() => { setAutoSelect(s.ingredient_id); }}
                                title="Order Guide-da seç"
                                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-90"
                              >
                                <ArrowDownCircle size={15} />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* auto-order notifications (13a: type='stock' feed) */}
                {notifs.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)] mb-2.5">Avto-sifariş Bildirişləri</p>
                    <div className="space-y-2">
                      {notifs.map((n: any) => (
                        <div key={n.id} className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-[var(--theme-text)]">{n.title}</p>
                            <p className="text-[11px] text-[var(--theme-text-muted)] mt-0.5">{n.body}</p>
                            {n.data?.items?.length > 0 && (
                              <div className="mt-1.5 space-y-0.5">
                                {n.data.items.map((item: any, idx: number) => (
                                  <p key={idx} className="text-[11px] text-[var(--theme-text-muted)]">• {item.name}: {item.current_stock} {item.unit} (min: {item.min_stock_level || 0})</p>
                                ))}
                              </div>
                            )}
                          </div>
                          {n.data?.whatsapp_url && (
                            <a href={n.data.whatsapp_url} target="_blank" rel="noopener noreferrer"
                              className="shrink-0 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all active:scale-[0.97]">
                              WhatsApp
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT: Lazım Olanlar (Order Guide = the actual order draft) */}
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)] mb-2.5">Lazım Olanlar · Sifariş Taslağı</p>
                <OrderGuideSection autoSelectId={autoSelect} />
              </div>
            </div>
          ))}

          {active === 'invoice' && <InvoiceUploadSection />}
          {active === 'orders' && isElevated && <PurchaseOrdersPage />}
          {active === 'suppliers' && <SuppliersSection />}
        </motion.div>
      </div>
    </ViewContent>
  );
}
