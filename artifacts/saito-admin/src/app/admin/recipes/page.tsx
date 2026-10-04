'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Search, Plus, Trash2, Loader2, CookingPot, ChevronDown, ChevronUp,
  Bot, Sparkles, Check, X, FileText, Upload, BrainCircuit, Wand2,
  BookOpen, Library
} from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { RecipeConstructorModal } from './components/RecipeConstructorModal';
import IntelligenceTab from './components/IntelligenceTab';

import { PageTransition } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';
import MobileModal from '@/components/ui/MobileModal';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import type {
  CookbookRecipe,
  Ingredient,
  ProductCatalogItem,
  RecipeRow,
  NormalizedRecipeIngredient,
} from '@/types/inventory';

export default function RecipesPage() {
  const { language } = useLanguage();
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newIngredientId, setNewIngredientId] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [saving, setSaving] = useState(false);

  // ── AI Suggestion state ──
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<CookbookRecipe[]>([]);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // ── Document Upload state ──
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [uploadText, setUploadText] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [viewMode, setViewMode] = useState<'recipes' | 'intelligence'>('recipes');

  // ── Constructor Modal state ──
  const [constructorOpen, setConstructorOpen] = useState(false);
  const [editConstructorProductId, setEditConstructorProductId] = useState<string | undefined>(undefined);

  // ── 13c: AI calibration (propose-only; apply goes through the atomic
  //      /api/recipes/save — the human always approves the BOM delta) ──
  const [calibratingFor, setCalibratingFor] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<any | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calApplying, setCalApplying] = useState<string | null>(null);

  // ── Cookbook state ──
  const [cookbookLoading, setCookbookLoading] = useState(false);
  const [cookbookResults, setCookbookResults] = useState<CookbookRecipe[]>([]);
  const [showCookbookPanel, setShowCookbookPanel] = useState(false);
  const [cookbookDragOver, setCookbookDragOver] = useState(false);
  const [cookbookMatchMap, setCookbookMatchMap] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      // 13a (E2E r26 S10c): client Supabase reads returned [] (the browser
      // REST session is anon for user JWTs → RLS blocks) → every product
      // showed "0 resept". Service-role API reads instead.
      const [productsData, ingredientsData, recipesData] = await Promise.all([
        fetch('/api/admin/products').then(r => r.json()).then(d => d.products as ProductCatalogItem[]),
        fetch('/api/ingredients').then(r => r.json()).catch(() => [] as Ingredient[]),
        fetch('/api/recipes').then(r => r.json()).catch(() => [] as RecipeRow[]),
      ]);
      setProducts(productsData);
      setIngredients(ingredientsData || []);
      setRecipes(recipesData || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Real-time subscription — products, ingredients, recipes dəyişikliklərini izlə
  useEffect(() => {
    const channel = createRealtimeChannel('recipes-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => fetchData())
      .subscribe();
    return () => { removeRealtimeChannel(channel); };
  }, [fetchData]);

  const getProductName = (p: ProductCatalogItem) => {
    return (language === 'en' ? p.name_en : language === 'ru' ? p.name_ru : p.name_az) || p.name_az || p.name_en || p.name_ru || p.name;
  };

  const getIngredientName = (id: string) => {
    const ing = ingredients.find(i => i.id === id);
    return ing ? `${ing.name} (${ing.unit})` : id.slice(0, 8);
  };

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p =>
      getProductName(p).toLowerCase().includes(q)
    );
  }, [products, search, language]);

  const productRecipes = (productId: string) =>
    recipes.filter(r => r.menu_item_id === productId).map(r => ({
      ...r,
      ingredient: ingredients.find(i => i.id === r.ingredient_id),
    }));

  const handleAdd = async (productId: string) => {
    if (!newIngredientId || !newQuantity) return;
    const qty = parseFloat(newQuantity);
    if (isNaN(qty) || qty <= 0) { toast.error('Miqdar düzgün deyil'); return; }
    setSaving(true);
    const ing = ingredients.find(i => i.id === newIngredientId);
    const coldWaste = ing?.cold_waste_percentage || 0;
    const qtyBrutto = coldWaste > 0 ? qty / (1 - coldWaste / 100) : qty;
    // 13a: service-role write (client INSERT has no RLS policy — was dead).
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_item_id: productId, ingredient_id: newIngredientId, quantity_required: qty,
        quantity_brutto: Math.round(qtyBrutto * 100) / 100, hot_waste_percentage: 0,
      }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error('Xəta: ' + (err.error || res.status)); }
    else { toast.success('Resept əlavə edildi'); setNewIngredientId(''); setNewQuantity(''); setAddingFor(null); fetchData(); }
    setSaving(false);
  };

  const handleDelete = async (recipeId: string) => {
    // 13a: service-role delete (client DELETE had no RLS policy).
    const res = await fetch(`/api/recipes?id=${recipeId}`, { method: 'DELETE' });
    if (!res.ok) toast.error('Xəta');
    else { toast.success('Silindi'); fetchData(); }
  };

  // ── Clear all recipes ──
  const [clearingAll, setClearingAll] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const clearAllRecipes = async () => {
    setClearConfirmOpen(false);
    setClearingAll(true);
    try {
      const res = await fetch('/api/recipes/clear-all', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Bütün reseptlər silindi');
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setClearingAll(false); }
  };

  // ── AI Suggestion handlers ──
  const generateAiSuggestions = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/recipes/ai-suggest', { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiSuggestions((data.suggestions || []) as CookbookRecipe[])
      setShowAiPanel(true);
      if (data.count === 0) toast('AI təklif tapılmadı — daha çox satış data-sı lazımdır');
      else toast.success(`${data.count} AI təklif tapıldı`);
      fetchData();
    } catch (e: any) {
      toast.error('AI xəta: ' + e.message);
    } finally { setAiLoading(false); }
  };

  const approveAi = async (suggestion: CookbookRecipe) => {
    try {
      const ingredientIds = (suggestion.ingredients as any[])
        .filter((r: any) => r.ingredient_id)
        .map((r: any) => r.ingredient_id);
      const res = await fetch('/api/recipes/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: suggestion.suggestedProductId,
          ingredientIds,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('AI resept təsdiqləndi');
      setAiSuggestions(prev => prev.filter(s => s.suggestedProductId !== suggestion.suggestedProductId));
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const rejectAi = async (productId: string) => {
    try {
      const res = await fetch('/api/recipes/approve', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('AI resept rədd edildi');
      setAiSuggestions(prev => prev.filter(s => s.suggestedProductId !== productId));
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Document Upload handlers ──
  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file || !uploadTarget) return;
    await readAndParseFile(file, uploadTarget);
  }, [uploadTarget]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    await readAndParseFile(file, uploadTarget);
  }, [uploadTarget]);

  const readAndParseFile = async (file: File, productId: string) => {
    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', productId);
      const res = await fetch('/api/parse-recipe', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(`${data.matchedCount} ingredient parse edildi`);
      setUploadTarget(null);
      fetchData();
    } catch (e: any) { toast.error('Parse xəta: ' + e.message); }
    finally { setUploadLoading(false); }
  };

  const parseFromText = async () => {
    if (!uploadText.trim() || !uploadTarget) return;
    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('text', uploadText);
      formData.append('productId', uploadTarget);
      const res = await fetch('/api/parse-recipe', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(`${data.matchedCount} ingredient parse edildi`);
      setUploadText(''); setUploadTarget(null);
      fetchData();
    } catch (e: any) { toast.error('Parse xəta: ' + e.message); }
    finally { setUploadLoading(false); }
  };

  // ── Cookbook handlers ──
  const handleCookbookDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setCookbookDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    await parseCookbook(file);
  }, []);

  const handleCookbookSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await parseCookbook(file);
  }, []);

  const parseCookbook = async (file: File) => {
    setCookbookLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/parse-cookbook', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCookbookResults(data.recipes || []);
      setShowCookbookPanel(true);
      const initialMatches: Record<string, string> = {};
      for (const r of (data.recipes || [])) {
        if (r.suggestedProductId) initialMatches[r.recipeName] = r.suggestedProductId;
      }
      setCookbookMatchMap(initialMatches);
      if (data.truncated) toast('PDF çox böyük idi, bəzə reseptlər qaçırıla bilər');
      toast.success(`${data.count} resept parse edildi`);
    } catch (e: any) { toast.error('Kokbuk xəta: ' + e.message); }
    finally { setCookbookLoading(false); }
  };

  const addCookbookRecipe = async (recipe: CookbookRecipe) => {
    const productId = cookbookMatchMap[recipe.recipeName] || recipe.suggestedProductId;
    if (!productId) { toast.error('Məhsul seçilməyib'); return; }
    if (recipe.ingredients.length === 0) { toast.error('Xəmmal tapılmadı'); return; }
    setSaving(true);
    try {
      // 13a: one service-role call replaces the 3+N RLS-blocked client calls.
      const res = await fetch('/api/recipes/ai-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ menu_item_id: productId, rows: recipe.ingredients }] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      toast.success(`${recipe.recipeName} əlavə edildi`);
      setCookbookResults(prev => prev.filter(r => r.recipeName !== recipe.recipeName));
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const addAllCookbookRecipes = async () => {
    const eligible = cookbookResults.filter(r => (cookbookMatchMap[r.recipeName] || r.suggestedProductId) && r.ingredients.length > 0);
    if (eligible.length === 0) { toast.error('Heç bir reseptə məhsul bağlanmayıb'); return; }
    setSaving(true);
    try {
      // 13a: batch service-role apply (one call for ALL products).
      const res = await fetch('/api/recipes/ai-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: eligible.map(recipe => ({
            menu_item_id: cookbookMatchMap[recipe.recipeName] || recipe.suggestedProductId,
            rows: recipe.ingredients,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      toast.success(`${eligible.length} resept əlavə edildi`);
      setCookbookResults([]);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // ── 13c: AI calibration handlers ──
  const openCalibration = async (productId: string) => {
    setCalibratingFor(productId);
    setCalLoading(true);
    try {
      const res = await fetch(`/api/recipes/calibrate?product_id=${productId}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setCalibration(data);
    } catch (e: any) {
      toast.error('Kalibrasiya xətası: ' + e.message);
    } finally {
      setCalLoading(false);
    }
  };

  const applyCalibrationSuggestion = async (s: any) => {
    if (!calibratingFor || !calibration) return;
    setCalApplying(s.ingredient_id);
    try {
      // Rebuild the full MANUAL BOM with the suggested qty swapped in, then
      // persist through the atomic save (one service-role call, is_ai_suggested
      // rows untouched).
      const rows = calibration.rows
        .filter((r: any) => !r.ai_suggested)
        .map((r: any) => ({
          ingredient_id: r.ingredient_id,
          quantity_required: r.ingredient_id === s.ingredient_id ? s.suggested_qty : r.bom_qty,
        }));
      const res = await fetch('/api/recipes/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_item_id: calibratingFor, rows }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      toast.success(`${s.name}: ${s.current_qty} → ${s.suggested_qty}`);
      setCalibration((prev: any | null) => prev
        ? { ...prev, suggestions: prev.suggestions.filter((x: any) => x.ingredient_id !== s.ingredient_id) }
        : prev);
      fetchData();
    } catch (e: any) {
      toast.error('Tətbiq edilmədi: ' + e.message);
    } finally {
      setCalApplying(null);
    }
  };

  // AI reseptləri olan product-ları tap
  const aiSuggestedRecipes = useMemo(() => {
    return recipes.filter(r => r.is_ai_suggested);
  }, [recipes]);

  return (
    <PageTransition className="min-h-screen p-6 max-w-5xl mx-auto">
      <GlassCard intensity="light" padding="lg" className="mb-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
              <CookingPot size={18} className="text-gold" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white">Reseptlər</h1>
              <p className="text-white/30 text-xs">Hər məhsulun hazırlanması üçün tələb olunan xəmmal</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['recipes', 'intelligence'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all active:scale-95 ${
                  viewMode === m ? 'bg-white/10 text-white border border-white/15' : 'text-white/30 hover:text-white/60 border border-transparent'
                }`}>
                {m === 'recipes' ? 'Reseptlər' : 'İntellekt'}
              </button>
            ))}
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={() => { setEditConstructorProductId(undefined); setConstructorOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold/10 border border-gold/20 text-gold text-xs font-bold hover:bg-gold/20 transition-all"
              >
                <Plus size={14} /> Yeni Resept
              </button>
              <button
                onClick={() => setShowAiPanel(!showAiPanel)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all ${showAiPanel ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'}`}
              >
                <BrainCircuit size={14} /> AI {aiSuggestedRecipes.length > 0 && (
                  <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{aiSuggestedRecipes.length}</span>
                )}
              </button>
              <button
                onClick={() => setShowCookbookPanel(!showCookbookPanel)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all ${showCookbookPanel ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'}`}
              >
                <BookOpen size={14} /> PDF {cookbookResults.length > 0 && (
                  <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{cookbookResults.length}</span>
                )}
              </button>
              <button
                onClick={() => setClearConfirmOpen(true)} disabled={clearingAll}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all active:scale-[0.97] disabled:opacity-30"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
              >
                {clearingAll ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      {viewMode === 'intelligence' && (
        <IntelligenceTab />
      )}

      <div style={{ display: viewMode === 'recipes' ? '' : 'none' }}>
      <MobileModal open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)}>
        <div className="space-y-4 text-center">
          <h3 className="text-lg font-bold">Bütün reseptlər silinsin?</h3>
          <p className="text-sm text-[var(--theme-text-secondary)]">Bu əməliyyat geri alına bilməz.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setClearConfirmOpen(false)}
              className="px-4 py-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)]"
            >
              Ləğv
            </button>
            <button
              onClick={clearAllRecipes}
              className="px-4 py-2 rounded-xl bg-[var(--theme-accent)] text-black font-semibold"
            >
              Sil
            </button>
          </div>
        </div>
      </MobileModal>

      {/* AI Suggestion Panel */}
      <AnimatePresence>
        {showAiPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }} className="overflow-hidden mb-4"
          >
            <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.05] to-purple-500/[0.03] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-400" />
                  <span className="text-sm font-bold text-white">AI Resept Təklifləri</span>
                </div>
                <button
                  onClick={generateAiSuggestions}
                  disabled={aiLoading}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-400 text-xs font-bold hover:bg-blue-500/25 transition-all disabled:opacity-40"
                >
                  {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                  Yeni təkliflər yarat
                </button>
              </div>

              {aiSuggestedRecipes.length === 0 && (
                <p className="text-white/30 text-xs py-2">Hazırda AI təklif yoxdur. &ldquo;Yeni təkliflər yarat&rdquo; basaraq satış data-sına əsasən təkliflər ala bilərsən.</p>
              )}

              <div className="space-y-2">
                {Array.from(new Set(aiSuggestedRecipes.map(r => r.menu_item_id))).map(pid => {
                  const prod = products.find(p => p.id === pid);
                  if (!prod) return null;
                  const prodRecipes = aiSuggestedRecipes.filter(r => r.menu_item_id === pid);
                  return (
                    <div key={pid} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Bot size={14} className="text-purple-400" />
                          <span className="text-sm font-medium text-white">{getProductName(prod)}</span>
                          <span className="text-[10px] text-purple-400/60 bg-purple-500/10 px-1.5 py-0.5 rounded-full">AI Təklif</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => approveAi({
  recipeName: getProductName(prod),
  suggestedProductId: pid,
  suggestedProductName: getProductName(prod),
  confidence: 0,
  ingredients: prodRecipes.map(r => ({
    ingredient_id: r.ingredient_id,
    ingredient_name: getIngredientName(r.ingredient_id),
    quantity_required: r.quantity_required,
    name: getIngredientName(r.ingredient_id),
    quantity: r.quantity_required,
    unit: '',
  })),
  unmatchedIngredients: 0,
  source: 'ai',
})} className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-all">
                            <Check size={14} />
                          </button>
                          <button onClick={() => rejectAi(pid)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {prodRecipes.map(r => (
                          <div key={r.id} className="flex items-center gap-2 text-xs text-white/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400/40" />
                            {getIngredientName(r.ingredient_id)} × {r.quantity_required}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cookbook Upload Panel */}
      <AnimatePresence>
        {showCookbookPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }} className="overflow-hidden mb-4"
          >
            <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.05] to-teal-500/[0.03] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Library size={16} className="text-emerald-400" />
                  <span className="text-sm font-bold text-white">Kokbuk Parser</span>
                  <span className="text-white/20 text-[10px]">PDF resept kitabını yüklə, AI hamısını parse edəcək</span>
                </div>
                {cookbookResults.length > 0 && (
                  <button
                    onClick={addAllCookbookRecipes}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition-all disabled:opacity-40"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Hamısını əlavə et
                  </button>
                )}
              </div>

              {cookbookResults.length === 0 && (
                <div
                  onDragOver={e => { e.preventDefault(); setCookbookDragOver(true); }}
                  onDragLeave={() => setCookbookDragOver(false)}
                  onDrop={handleCookbookDrop}
                  className={`rounded-xl border-2 border-dashed p-6 text-center transition-all ${cookbookDragOver ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10 bg-white/[0.02]'}`}
                >
                  {cookbookLoading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={24} className="animate-spin text-emerald-400" />
                      <p className="text-[var(--theme-text-secondary)] text-xs">Kokbuk parse edilir, bu bir neçə saniyə çəkə bilər...</p>
                    </div>
                  ) : (
                    <>
                      <Upload size={28} className="mx-auto mb-2 text-white/20" />
                      <p className="text-[var(--theme-text-secondary)] text-sm font-medium">Resept kitabını (PDF) bura sürüklə</p>
                      <p className="text-white/20 text-xs mt-1">və ya kliklə seç — AI bütün reseptləri parse edəcək</p>
                      <input type="file" accept=".pdf,.txt" onChange={handleCookbookSelect} className="hidden" id="cookbook-file" />
                      <label htmlFor="cookbook-file" className="inline-block mt-3 px-4 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold cursor-pointer hover:bg-emerald-500/20 transition-all">
                        Fayl seç
                      </label>
                    </>
                  )}
                </div>
              )}

              {cookbookResults.length > 0 && (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {cookbookResults.map((recipe, idx) => (
                    <div key={idx} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <BookOpen size={12} className="text-emerald-400" />
                          <span className="text-sm font-medium text-white">{recipe.recipeName}</span>
                          {recipe.confidence > 0.7 && <span className="text-[10px] text-emerald-400/60 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">Yüksək uyğunluq</span>}
                        </div>
                        <button
                          onClick={() => addCookbookRecipe(recipe)}
                          disabled={saving}
                          className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-all disabled:opacity-30"
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white/20 text-[10px]">Məhsul:</span>
                        <select
                          value={cookbookMatchMap[recipe.recipeName] || recipe.suggestedProductId || ''}
                          onChange={e => setCookbookMatchMap(prev => ({ ...prev, [recipe.recipeName]: e.target.value }))}
                          className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-white/20"
                        >
                          <option value="" className="bg-[#1a1a1a]">Məhsul seç...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id} className="bg-[#1a1a1a]">{getProductName(p)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        {recipe.ingredients.map((ing: NormalizedRecipeIngredient, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-white/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/40" />
                            {ing.name} × {ing.quantity} {ing.unit}
                          </div>
                        ))}
                        {recipe.unmatchedIngredients > 0 && (
                          <p className="text-[10px] text-amber-400/50">{recipe.unmatchedIngredients} xəmmal match edilmədi</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Məhsul axtar..."
          className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25 transition-all"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-white/20" />
        </div>
      ) : (
        <div className="space-y-2">
          {filteredProducts.map(product => {
            const isExpanded = expandedProduct === product.id;
            const recs = productRecipes(product.id);
            const hasAi = recs.some(r => r.is_ai_suggested);
            const name = getProductName(product);
            return (
               <div key={product.id} className={`rounded-2xl border ${hasAi ? 'border-purple-500/15' : 'border-white/[0.06]'} bg-white/[0.02] overflow-hidden`}>
                 <button
                   onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                   className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-all text-left"
                 >
                   {product.image_url ? (
                     <img src={product.image_url} alt={name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                   ) : (
                     <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex-shrink-0" />
                   )}
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2">
                       <p className="text-sm font-semibold text-white truncate">{name}</p>
                     </div>
                     <p className="text-white/30 text-xs mt-0.5">{product.price.toFixed(2)} ₼ · {recs.length} resept</p>
                   </div>
                   {isExpanded ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
                 </button>

                 {isExpanded && (
                   <div className="px-4 pb-4 border-t border-white/[0.05]">
                     {recs.length > 0 && (
                       <div className="space-y-1.5 mt-3">
                         {recs.map(r => (
                           <div key={r.id} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${r.is_ai_suggested ? 'bg-purple-500/[0.04] border-purple-500/15' : 'bg-white/[0.03] border-white/[0.05]'}`}>
                             <div className="flex items-center gap-2">
                               <span className={`w-1.5 h-1.5 rounded-full ${r.is_ai_suggested ? 'bg-purple-400/60' : 'bg-amber-400/60'}`} />
                               <span className="text-white/80 text-sm">{r.ingredient?.name || getIngredientName(r.ingredient_id)}</span>
                               <span className="text-white/30 text-xs">× {r.quantity_required} {r.ingredient?.unit || ''}</span>
                             </div>
                             <button onClick={() => handleDelete(r.id)} className="w-7 h-7 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all flex items-center justify-center">
                               <Trash2 size={13} />
                             </button>
                           </div>
                         ))}
                       </div>
                     )}

                      {/* 13c: AI calibration entry point (BOM vs 30-day actuals) */}
                      {recs.length > 0 && (
                        <div className="mt-3">
                          <button
                            onClick={() => openCalibration(product.id)}
                            disabled={calLoading}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-bold hover:bg-purple-500/20 transition-all disabled:opacity-40"
                          >
                            {calLoading && calibratingFor === product.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <BrainCircuit size={13} />}
                            Kalibrasiya (AI) — 30 gündə BOM vs faktiki sərf
                          </button>
                        </div>
                      )}

                      <div className="mt-3 pt-3 border-t border-white/[0.05]">
                        {addingFor === product.id ? (
                         <div className="flex items-center gap-2">
                           <select
                             value={newIngredientId}
                             onChange={e => setNewIngredientId(e.target.value)}
                             className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/25"
                           >
                             <option value="" className="bg-[#1a1a1a]">Xəmmal seç</option>
                             {ingredients.map(i => (
                               <option key={i.id} value={i.id} className="bg-[#1a1a1a]">{i.name} ({i.unit}) — {i.current_stock}</option>
                             ))}
                           </select>
                           <input
                             type="number"
                             value={newQuantity}
                             onChange={e => setNewQuantity(e.target.value)}
                             placeholder="Miqdar"
                             className="w-28 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
                           />
                            <button onClick={() => handleAdd(product.id)} disabled={saving || !newIngredientId || !newQuantity} className="px-4 py-2.5 rounded-xl bg-gold text-black text-xs font-black hover:bg-white transition-all disabled:opacity-30">
                              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                           <button onClick={() => { setAddingFor(null); setNewIngredientId(''); setNewQuantity(''); }} className="px-3 py-2.5 rounded-xl border border-white/10 text-white/50 text-xs hover:text-white hover:bg-white/5 transition-all">
                             <X size={13} />
                           </button>
                         </div>
                       ) : (
                         <button
                           onClick={() => { setAddingFor(product.id); setNewIngredientId(''); setNewQuantity(''); }}
                           className="flex items-center gap-2 text-gold/70 text-xs hover:text-gold transition-all py-2"
                         >
                           <Plus size={13} /> Xəmmal əlavə et
                         </button>
                       )}
                     </div>
                   </div>
                 )}
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
            <GlassCard intensity="light" padding="xl" className="text-center">
              <CookingPot size={36} className="mx-auto mb-3 opacity-20 text-white/30" />
              <p className="text-white/30 text-sm font-medium">
                {search ? 'Axtarış nəticəsi tapılmadı' : 'Hələ məhsul yoxdur'}
              </p>
              <p className="text-white/15 text-xs mt-1">
                {!search && 'Məhsul əlavə etdikdən sonra hər birinə resept təyin edə bilərsiniz'}
              </p>
            </GlassCard>
          )}
        </div>
      )}
      </div>

      {/* 13c: AI Calibration modal — propose-only, human applies */}
      <MobileModal open={!!calibration} onClose={() => { setCalibration(null); setCalibratingFor(null); }}>
        {calibration && (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BrainCircuit size={16} className="text-purple-400" /> Kalibrasiya — {calibration.product_name}
                </h3>
                <p className="text-xs text-white/40 mt-1">
                  30 gün: {calibration.sales_30d} ədəd satılıb · BOM vs faktiki sərfiyyat
                </p>
              </div>
              <button onClick={() => { setCalibration(null); setCalibratingFor(null); }} className="p-1.5 rounded-lg text-white/30 hover:text-white transition-colors shrink-0">
                <X size={16} />
              </button>
            </div>

            {calibration.ai === 'no_recipe' && (
              <p className="text-sm text-white/40">Bu məhsulun resepti yoxdur — əvvəlcə BOM daxil edin.</p>
            )}
            {calibration.ai === 'no_sales' && (
              <p className="text-sm text-amber-400/80">Son 30 gündə satış yoxdur — LLM təklif üçün data çatmır. Aşağıdakı cədvəl yalnız BOM-un özüdür.</p>
            )}

            {calibration.rows.length > 0 && (
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-white/30 uppercase text-[10px] tracking-wider" style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <th className="px-3 py-2 font-bold">Xəmmal</th>
                      <th className="px-3 py-2 text-right font-bold">BOM</th>
                      <th className="px-3 py-2 text-right font-bold">Təxmin 30g</th>
                      <th className="px-3 py-2 text-right font-bold">Faktiki</th>
                      <th className="px-3 py-2 text-right font-bold">Fərq</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibration.rows.map((r: any) => (
                      <tr key={r.ingredient_id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td className="px-3 py-2 text-white/80">{r.name}{r.ai_suggested && <span className="ml-1.5 text-[9px] text-purple-400/60">AI</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-white/60">{r.bom_qty}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-white/40">{r.theoretical}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-white/60">{r.actual}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-bold ${r.variance_pct == null ? 'text-white/20' : Math.abs(r.variance_pct) > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {r.variance_pct == null ? '—' : `${r.variance_pct > 0 ? '+' : ''}${r.variance_pct}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {calibration.ai !== 'no_recipe' && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 flex items-center gap-1.5">
                  <BrainCircuit size={12} className="text-purple-400" /> AI təklifləri
                </p>
                {calibration.suggestions.length === 0 ? (
                  <p className="text-xs text-white/30">BOM faktiki sərfiyyata uyğundur — düzəliş təklif olunmur.</p>
                ) : (
                  <div className="space-y-2">
                    {calibration.suggestions.map((s: any) => (
                      <div key={s.ingredient_id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium">{s.name}</p>
                          <p className="text-[11px] text-white/40 truncate">{s.reason}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs tabular-nums text-white/50">
                            {s.current_qty} <span className="text-white/25">→</span> <span className="text-purple-300 font-bold">{s.suggested_qty}</span>
                          </span>
                          <button
                            onClick={() => applyCalibrationSuggestion(s)}
                            disabled={calApplying === s.ingredient_id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-40"
                            style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.3)', color: '#d8b4fe' }}
                          >
                            {calApplying === s.ingredient_id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Tətbiq et
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] text-white/25">
              Tətbiq = BOM-un atomik yenidən yazılması (yalnız manuel sətirlər). AI yalnız təklif verir — qərar sizindir.
            </p>
          </div>
        )}
      </MobileModal>

      {/* Recipe Constructor Modal */}
      <RecipeConstructorModal
        isOpen={constructorOpen}
        onClose={() => { setConstructorOpen(false); setEditConstructorProductId(undefined); }}
        onSaved={fetchData}
        editProductId={editConstructorProductId}
      />
    </PageTransition>
  );
}
