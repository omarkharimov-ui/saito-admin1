'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Loader2, CookingPot, FlaskConical, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { useTheme } from '@/lib/theme/ThemeContext';

interface Product {
  id: string;
  name: string;
  name_az?: string | null;
  price: number;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  average_cost_per_unit: number;
  current_stock: number;
  cold_waste_percentage: number;
}

interface RecipeLine {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity: number;              // netto
  quantity_brutto: number;       // netto / (1 - cold_waste/100)
  hot_waste_percentage: number;
  cost: number;                  // quantity_brutto * unit_cost
}

const modalV = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  show:   { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 32 } },
  exit:   { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.14 } },
};

interface RecipeConstructorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editProductId?: string;
}

export function RecipeConstructorModal({ isOpen, onClose, onSaved, editProductId }: RecipeConstructorModalProps) {
  const { lightMode } = useTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(editProductId || '');
  const [rows, setRows] = useState<RecipeLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [loading, setLoading] = useState(true);

  const toastStyle = { background: lightMode ? '#ffffff' : '#0f0f0f', color: lightMode ? '#111827' : '#fff', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px' };

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      const [pRes, iRes] = await Promise.all([
        supabase.from('products').select('id, name, name_az, price').order('name_az'),
        supabase.from('ingredients').select('id, name, unit, average_cost_per_unit, current_stock, cold_waste_percentage').order('name'),
      ]);
      setProducts((pRes.data || []) as Product[]);
      setIngredients((iRes.data || []) as Ingredient[]);

      if (editProductId) {
        setSelectedProductId(editProductId);
        const { data: existing } = await supabase
          .from('recipes')
          .select('ingredient_id, quantity_required, quantity_brutto, hot_waste_percentage')
          .eq('menu_item_id', editProductId)
          .eq('is_ai_suggested', false);
        if (existing && existing.length > 0) {
          const ingredientMap = new Map((iRes.data || []).map(i => [i.id, i]));
          setRows(existing.map(r => {
            const ing = ingredientMap.get(r.ingredient_id);
            const qtyBrutto = r.quantity_brutto ?? r.quantity_required;
            return {
              ingredient_id: r.ingredient_id,
              ingredient_name: ing?.name || r.ingredient_id,
              unit: ing?.unit || '',
              quantity: r.quantity_required,
              quantity_brutto: qtyBrutto,
              hot_waste_percentage: r.hot_waste_percentage ?? 0,
              cost: (ing?.average_cost_per_unit || 0) * qtyBrutto,
            };
          }));
        }
      }
      setLoading(false);
    })();
  }, [isOpen, editProductId]);

  const ingredientMap = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);

  const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [products, selectedProductId]);

  const totalCost = useMemo(() => rows.reduce((sum, r) => sum + r.cost, 0), [rows]);

  const salePrice = selectedProduct?.price || 0;
  const profit = salePrice - totalCost;
  const marginPct = salePrice > 0 ? (profit / salePrice) * 100 : 0;

  function calcBrutto(ingredientId: string, nettoQty: number, hotWastePct = 0): number {
    if (nettoQty <= 0) return 0;
    const ing = ingredientMap.get(ingredientId);
    const coldPct = ing?.cold_waste_percentage || 0;
    const cold = coldPct / 100;
    const hot = (hotWastePct || 0) / 100;
    if (cold >= 1 || hot >= 1) return nettoQty;
    let qty = nettoQty;
    if (cold > 0) qty = qty / (1 - cold);
    if (hot > 0) qty = qty / (1 - hot);
    return Math.round(qty);
  }

  const addRow = () => {
    setRows(prev => [...prev, {
      ingredient_id: '', ingredient_name: '', unit: '', quantity: 0,
      quantity_brutto: 0, hot_waste_percentage: 0, cost: 0,
    }]);
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const updateRowIngredient = (idx: number, ingId: string) => {
    const ing = ingredientMap.get(ingId);
    if (!ing) return;
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const qtyBrutto = calcBrutto(ingId, r.quantity, r.hot_waste_percentage);
      return {
        ...r,
        ingredient_id: ingId,
        ingredient_name: ing.name,
        unit: ing.unit,
        quantity: r.quantity,
        quantity_brutto: qtyBrutto,
        cost: ing.average_cost_per_unit * qtyBrutto,
      };
    }));
  };

  const updateRowQuantity = (idx: number, qty: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const qtyBrutto = calcBrutto(r.ingredient_id, qty, r.hot_waste_percentage);
      const ing = ingredientMap.get(r.ingredient_id);
      return {
        ...r,
        quantity: qty,
        quantity_brutto: qtyBrutto,
        cost: (ing?.average_cost_per_unit || 0) * qtyBrutto,
      };
    }));
  };

  const updateRowHotWaste = (idx: number, hotWastePct: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const qtyBrutto = calcBrutto(r.ingredient_id, r.quantity, hotWastePct);
      const ing = ingredientMap.get(r.ingredient_id);
      return { ...r, hot_waste_percentage: hotWastePct, quantity_brutto: qtyBrutto, cost: (ing?.average_cost_per_unit || 0) * qtyBrutto };
    }));
  };

  const handleSave = async () => {
    if (!selectedProductId) { toast.error('Məhsul seçin', { style: toastStyle }); return; }
    const validRows = rows.filter(r => r.ingredient_id && r.quantity > 0);
    if (validRows.length === 0) { toast.error('Ən azı 1 inqrediyent əlavə edin', { style: toastStyle }); return; }
    setSaving(true);
    try {
      await supabase.from('recipes').delete().eq('menu_item_id', selectedProductId).eq('is_ai_suggested', false);

      const inserts = validRows.map(r => ({
        menu_item_id: selectedProductId,
        ingredient_id: r.ingredient_id,
        quantity_required: r.quantity,
        quantity_brutto: r.quantity_brutto,
        hot_waste_percentage: r.hot_waste_percentage,
        is_ai_suggested: false,
      }));
      const { error } = await supabase.from('recipes').insert(inserts);
      if (error) throw error;

      await supabase.from('products').update({ has_active_recipe: true }).eq('id', selectedProductId);

      toast.success('Resept yadda saxlanıldı', { style: toastStyle });
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Xəta', { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setSelectedProductId(editProductId || '');
    setRows([]);
  };

  const aiSuggest = async () => {
    if (!selectedProduct) { toast.error('Əvvəlcə məhsul seçin', { style: toastStyle }); return; }
    const dishName = (selectedProduct as any).name_az || selectedProduct.name;
    setAiSuggesting(true);
    try {
      const res = await fetch(`/api/recipes/ai-suggest-ingredients?dishName=${encodeURIComponent(dishName)}`);
      const data = await res.json();
      if (!data.suggestions || data.suggestions.length === 0) {
        toast.error('AI təklif gətirə bilmədi', { style: toastStyle });
        return;
      }
      const newRows: RecipeLine[] = data.suggestions.map((s: any) => {
        const matched = ingredients.find(i => i.name.toLowerCase().includes(s.ingredientName.toLowerCase()) || s.ingredientName.toLowerCase().includes(i.name.toLowerCase()));
        if (!matched) return null;
        const qty = s.quantity || 0;
        const qtyBrutto = calcBrutto(matched.id, qty, 0);
        return {
          ingredient_id: matched.id,
          ingredient_name: matched.name,
          unit: matched.unit,
          quantity: qty,
          quantity_brutto: qtyBrutto,
          hot_waste_percentage: 0,
          cost: matched.average_cost_per_unit * qtyBrutto,
        };
      }).filter(Boolean);
      if (newRows.length === 0) {
        toast.error('AI təklifləri anbarda olan xammalla uyğunlaşdırıla bilmədi', { style: toastStyle });
        return;
      }
      setRows(newRows);
      toast.success(`${newRows.length} inqrediyent AI tərəfindən təklif edildi`, { style: toastStyle });
    } catch {
      toast.error('AI xətası', { style: toastStyle });
    } finally {
      setAiSuggesting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { reset(); onClose(); }}
          />
          <motion.div
            variants={modalV} initial="hidden" animate="show" exit="exit"
            className="relative z-10 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl flex flex-col gap-0 overflow-hidden max-h-[90vh]"
            style={{ background: lightMode ? '#ffffff' : '#0e0e0e', border: lightMode ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.08)', boxShadow: lightMode ? '0 32px 80px rgba(0,0,0,0.12)' : '0 32px 80px rgba(0,0,0,0.7)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className={`w-10 h-1 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/15'}`} />
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5"
                    style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                    <CookingPot size={10} /> Resept Konstruktoru
                  </span>
                  <h2 className="text-xl font-bold">{selectedProduct ? (selectedProduct as any).name_az || selectedProduct.name : 'Yeni Resept'}</h2>
                </div>
                <button onClick={() => { reset(); onClose(); }} className={`transition-colors mt-1 ${lightMode ? 'text-gray-300 hover:text-gray-900' : 'text-white/25 hover:text-white'}`}>
                  <X size={18} />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className={`animate-spin ${lightMode ? 'text-gray-300' : 'text-white/20'}`} />
                </div>
              ) : (
                <>
                  <div>
                    <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${lightMode ? 'text-gray-400' : 'text-white/35'}`}>
                      Məhsul <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={selectedProductId}
                      onChange={e => setSelectedProductId(e.target.value)}
                      className={`w-full px-4 py-3.5 rounded-xl border border-white/[0.09] outline-none focus:border-gold/40 transition-colors text-sm ${lightMode ? 'text-gray-900 bg-gray-50/80' : 'text-white bg-white/[0.04]'}`}
                    >
                      <option value="" className="bg-[#111]">Menyudan məhsul seç...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id} className="bg-[#111]">{(p as any).name_az || p.name} — ₼{p.price}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className={`text-[11px] font-semibold uppercase tracking-wider ${lightMode ? 'text-gray-400' : 'text-white/35'}`}>
                        Tərkibi <span className={lightMode ? 'text-gray-300' : 'text-white/20'}>({rows.length} inqrediyent)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button onClick={aiSuggest} disabled={aiSuggesting || !selectedProduct}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95 disabled:opacity-40"
                          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#A78BFA' }}>
                          {aiSuggesting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} AI Təklif et
                        </button>
                        <button onClick={addRow}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                        style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                        <Plus size={11} /> İnqrediyent Əlavə Et
                      </button>
                    </div>
                  </div>

                    {rows.length === 0 && (
                      <div className={`text-center py-8 text-xs ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                        <FlaskConical size={24} className="mx-auto mb-2 opacity-40" />
                        Hələ inqrediyent əlavə edilməyib
                      </div>
                    )}

                    <AnimatePresence>
                      {rows.map((row, idx) => {
                        const ing = ingredientMap.get(row.ingredient_id);
                        const coldPct = ing?.cold_waste_percentage || 0;
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: -8, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, x: 20, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-start gap-2 px-3 py-2 rounded-xl"
                            style={{ background: lightMode ? '#f3f4f6' : 'rgba(255,255,255,0.03)', border: lightMode ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.06)' }}
                          >
                            <span className={`text-[10px] font-mono w-5 mt-3 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>{idx + 1}.</span>
                            <div className="flex-1 space-y-1.5">
                              <select
                                value={row.ingredient_id}
                                onChange={e => updateRowIngredient(idx, e.target.value)}
                                className={`w-full border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-gold/30 ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900' : 'bg-white/[0.04] border-white/[0.07] text-white'}`}
                              >
                                <option value="" className="bg-[#111]">Xammal seç...</option>
                                {ingredients.map(ing => (
                                  <option key={ing.id} value={ing.id} className="bg-[#111]">
                                    {ing.name} ({ing.unit}) — ₼{ing.average_cost_per_unit}/{ing.unit}
                                    {ing.cold_waste_percentage > 0 && ` · soyuq itki: ${ing.cold_waste_percentage}%`}
                                    · stok: {ing.current_stock}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number" min="0" step="0.001"
                                  value={row.quantity || ''}
                                  onChange={e => updateRowQuantity(idx, parseFloat(e.target.value) || 0)}
                                  placeholder="Netto"
                                  className={`w-20 border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-gold/30 text-right tabular-nums ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900 placeholder:text-gray-400' : 'bg-white/[0.04] border-white/[0.07] text-white placeholder:text-white/20'}`}
                                />
                                <span className={`text-[9px] w-10 ${lightMode ? 'text-gray-300' : 'text-white/25'}`}>netto</span>
                                <input
                                  type="number" min="0" step="0.01"
                                  value={row.quantity_brutto || ''}
                                  placeholder="Brutto"
                                  className={`w-20 border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-amber-400/30 text-right tabular-nums ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-500 placeholder:text-gray-400' : 'bg-white/[0.04] border-white/[0.07] text-white/60 placeholder:text-white/20'}`}
                                  readOnly
                                />
                                <span className={`text-[9px] w-10 ${lightMode ? 'text-gray-300' : 'text-white/25'}`}>brutto</span>
                                <input
                                  type="number" min="0" max="99" step="1"
                                  value={row.hot_waste_percentage || ''}
                                  onChange={e => updateRowHotWaste(idx, parseFloat(e.target.value) || 0)}
                                  placeholder="İsti%"
                                  className={`w-16 border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-rose-400/30 text-right tabular-nums ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-500 placeholder:text-gray-400' : 'bg-white/[0.04] border-white/[0.07] text-white/60 placeholder:text-white/20'}`}
                                />
                                <span className={`text-[9px] w-12 ${lightMode ? 'text-gray-300' : 'text-white/25'}`}>isti%</span>
                                <button onClick={() => removeRow(idx)}
                                  className={`w-7 h-7 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-all flex items-center justify-center flex-shrink-0 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              {coldPct > 0 && row.quantity > 0 && (
                                <p className="text-[9px] text-red-400/40 ml-1">
                                  soyuq itki {coldPct}% · brutto {row.quantity_brutto} {row.unit}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {rows.some(r => r.ingredient_id) && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl p-4 space-y-2"
                      style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)' }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gold/60">Maya Dəyəri Hesabatı</p>

                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>Brutto Maya Dəyəri (cold waste daxil)</span>
                        <motion.span
                          key={totalCost}
                          initial={{ scale: 1.3, color: '#D4AF37' }}
                          animate={{ scale: 1, color: lightMode ? '#111827' : '#ffffff' }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                          className={`text-2xl font-black tabular-nums ${lightMode ? 'text-gray-900' : 'text-white'}`}
                        >
                          ₼{totalCost.toFixed(2)}
                        </motion.span>
                      </div>

                      {selectedProduct && salePrice > 0 && (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="px-3 py-2 rounded-lg" style={{ background: lightMode ? '#f3f4f6' : 'rgba(255,255,255,0.03)' }}>
                            <p className={`text-[9px] uppercase tracking-wider ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Satış Qiyməti</p>
                            <p className={`text-sm font-bold tabular-nums ${lightMode ? 'text-gray-700' : 'text-white/80'}`}>₼{salePrice.toFixed(2)}</p>
                          </div>
                          <div className="px-3 py-2 rounded-lg" style={{ background: profit >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)' }}>
                            <p className={`text-[9px] uppercase tracking-wider ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Xalis Qazanc</p>
                            <p className={`text-sm font-bold tabular-nums ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {profit >= 0 ? '+' : ''}₼{profit.toFixed(2)}
                              <span className="ml-1 text-[10px]">({marginPct >= 0 ? '+' : ''}{marginPct.toFixed(1)}%)</span>
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedProduct && salePrice > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <div className={`flex items-center justify-between text-[9px] uppercase tracking-wider ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>
                            <span>Mənfəət Marjı</span>
                            <span className="tabular-nums font-bold">{marginPct >= 0 ? '+' : ''}{marginPct.toFixed(1)}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full" style={{ background: lightMode ? '#e5e7eb' : 'rgba(255,255,255,0.06)' }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(Math.max(marginPct, 0), 100)}%` }}
                              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                              className="h-full rounded-full"
                              style={{
                                background: marginPct <= 0
                                  ? 'linear-gradient(90deg, #EF4444, #DC2626)'
                                  : marginPct < 15
                                    ? 'linear-gradient(90deg, #F59E0B, #D97706)'
                                    : marginPct < 30
                                      ? 'linear-gradient(90deg, #D4AF37, #B8960C)'
                                      : 'linear-gradient(90deg, #22C55E, #16A34A)',
                                boxShadow: marginPct > 30
                                  ? '0 0 8px rgba(34,197,94,0.3)'
                                  : marginPct > 0
                                    ? '0 0 8px rgba(212,175,55,0.2)'
                                    : 'none',
                              }}
                            />
                          </div>
                          <div className={`flex justify-between text-[8px] ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                            <span>0%</span>
                            <span>15%</span>
                            <span>30%</span>
                            <span>100%</span>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1 pt-1">
                        {rows.filter(r => r.ingredient_id && r.cost > 0).map((r, idx) => {
                          const diff = Math.round(r.quantity_brutto - r.quantity);
                          return (
                            <div key={idx} className={`text-[10px] ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>
                              <div className="flex items-center justify-between">
                                <span>{r.ingredient_name}</span>
                                <span className="tabular-nums">₼{r.cost.toFixed(2)}</span>
                              </div>
                              <p className={`text-[8px] ${lightMode ? 'text-gray-200' : 'text-white/15'}`}>
                                netto {r.quantity} {r.unit}
                                {diff > 0 && ` → brutto ${r.quantity_brutto} ${r.unit} (+${diff} itki)`}
                                {r.hot_waste_percentage > 0 && ` · bişmə itkisi ${r.hot_waste_percentage}%`}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>

            <div className={`flex-shrink-0 p-4 border-t flex items-center gap-3 ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
              <button onClick={() => { reset(); onClose(); }}
                className={`flex-1 py-3 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.98] border ${lightMode ? 'text-gray-400 hover:text-gray-600 border-gray-200' : 'text-white/40 hover:text-white/60 border-white/10'}`}>
                Ləğv et
              </button>
              <button onClick={handleSave} disabled={saving || !selectedProductId || rows.filter(r => r.ingredient_id && r.quantity > 0).length === 0}
                className="flex-1 py-3 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)', color: '#0a0a0a' }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={15} />}
                {editProductId ? 'Yadda saxla' : 'Resept yarat'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default RecipeConstructorModal;
