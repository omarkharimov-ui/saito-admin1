'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Search, Plus, Trash2, Loader2, CookingPot, ChevronDown, ChevronUp,
  Bot, Sparkles, Check, X, FileText, Upload, BrainCircuit, Wand2,
  BookOpen, Library
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { RecipeConstructorModal } from './components/RecipeConstructorModal';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { useTheme } from '@/lib/theme/ThemeContext';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
}

interface Product {
  id: string;
  name: string;
  name_az?: string | null;
  name_en?: string | null;
  name_ru?: string | null;
  image_url?: string | null;
  price: number;
}

interface RecipeRow {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity_required: number;
  is_ai_suggested?: boolean;
  ingredient?: Ingredient;
}

interface AiSuggestion {
  product_id: string;
  product_name: string;
  total_sold: number;
  recipe: { ingredient_id: string; ingredient_name: string; quantity_required: number; unit: string }[];
}

interface CookbookRecipe {
  recipeName: string;
  suggestedProductId: string | null;
  suggestedProductName: string | null;
  confidence: number;
  ingredients: { ingredient_id: string; ingredient_name: string; quantity_required: number; unit: string }[];
  unmatchedIngredients: number;
}

export default function RecipesPage() {
  const { language } = useLanguage();
  const { lightMode } = useTheme();
  const [products, setProducts] = useState<Product[]>([]);
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
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // ── Document Upload state ──
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [uploadText, setUploadText] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ── Constructor Modal state ──
  const [constructorOpen, setConstructorOpen] = useState(false);
  const [editConstructorProductId, setEditConstructorProductId] = useState<string | undefined>(undefined);

  // ── Cookbook state ──
  const [cookbookLoading, setCookbookLoading] = useState(false);
  const [cookbookResults, setCookbookResults] = useState<CookbookRecipe[]>([]);
  const [showCookbookPanel, setShowCookbookPanel] = useState(false);
  const [cookbookDragOver, setCookbookDragOver] = useState(false);
  const [cookbookMatchMap, setCookbookMatchMap] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, iRes, rRes] = await Promise.all([
        supabase.from('products').select('id, name, name_az, name_en, name_ru, image_url, price').order('name_az'),
        supabase.from('ingredients').select('id, name, unit, current_stock').order('name'),
        supabase.from('recipes').select('id, menu_item_id, ingredient_id, quantity_required, is_ai_suggested'),
      ]);
      setProducts((pRes.data || []) as Product[]);
      setIngredients((iRes.data || []) as Ingredient[]);
      setRecipes((rRes.data || []) as RecipeRow[]);
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

  // Polling fallback — realtime işləməsə 10sn-də bir yenilə
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getProductName = (p: Product) => {
    const pp = p as any;
    return (language === 'en' ? pp.name_en : language === 'ru' ? pp.name_ru : pp.name_az) || pp.name_az || pp.name_en || pp.name_ru || p.name;
  };

  const getIngredientName = (id: string) => {
    const ing = ingredients.find(i => i.id === id);
    return ing ? `${ing.name} (${ing.unit})` : id.slice(0, 8);
  };

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => getProductName(p).toLowerCase().includes(q));
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
    const { error } = await supabase.from('recipes').insert({
      menu_item_id: productId, ingredient_id: newIngredientId, quantity_required: qty,
    });
    if (error) toast.error('Xəta: ' + error.message);
    else { toast.success('Resept əlavə edildi'); setNewIngredientId(''); setNewQuantity(''); setAddingFor(null); fetchData(); }
    setSaving(false);
  };

  const handleDelete = async (recipeId: string) => {
    const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
    if (error) toast.error('Xəta');
    else { toast.success('Silindi'); fetchData(); }
  };

  // ── Clear all recipes ──
  const [clearingAll, setClearingAll] = useState(false);
  const clearAllRecipes = async () => {
    if (!confirm('Bütün reseptlər silinsin? Bu əməliyyat geri alına bilməz!')) return;
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
      setAiSuggestions(data.suggestions || []);
      setShowAiPanel(true);
      if (data.count === 0) toast('AI təklif tapılmadı — daha çox satış data-sı lazımdır');
      else toast.success(`${data.count} AI təklif tapıldı`);
      fetchData();
    } catch (e: any) {
      toast.error('AI xəta: ' + e.message);
    } finally { setAiLoading(false); }
  };

  const approveAi = async (suggestion: AiSuggestion) => {
    try {
      const res = await fetch('/api/recipes/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: suggestion.product_id, ingredientIds: suggestion.recipe.map(r => r.ingredient_id) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('AI resept təsdiqləndi');
      setAiSuggestions(prev => prev.filter(s => s.product_id !== suggestion.product_id));
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
      setAiSuggestions(prev => prev.filter(s => s.product_id !== productId));
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
      await supabase.from('recipes').delete().eq('menu_item_id', productId).eq('is_ai_suggested', true);
      for (const ing of recipe.ingredients) {
        await supabase.from('recipes').insert({
          menu_item_id: productId, ingredient_id: ing.ingredient_id,
          quantity_required: ing.quantity_required, is_ai_suggested: true,
        });
      }
      await supabase.from('products').update({ has_active_recipe: true }).eq('id', productId);
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
      for (const recipe of eligible) {
        const pid = cookbookMatchMap[recipe.recipeName] || recipe.suggestedProductId;
        if (!pid) continue;
        await supabase.from('recipes').delete().eq('menu_item_id', pid).eq('is_ai_suggested', true);
        for (const ing of recipe.ingredients) {
          await supabase.from('recipes').insert({
            menu_item_id: pid, ingredient_id: ing.ingredient_id,
            quantity_required: ing.quantity_required, is_ai_suggested: true,
          });
        }
        await supabase.from('products').update({ has_active_recipe: true }).eq('id', pid);
      }
      toast.success(`${eligible.length} resept əlavə edildi`);
      setCookbookResults([]);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // AI reseptləri olan product-ları tap
  const aiSuggestedRecipes = useMemo(() => {
    return recipes.filter(r => r.is_ai_suggested);
  }, [recipes]);

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <CookingPot size={18} className="text-gold" />
          </div>
          <div>
            <h1 className={`text-xl font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Reseptlər</h1>
            <p className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Hər məhsulun hazırlanması üçün tələb olunan xəmmal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditConstructorProductId(undefined); setConstructorOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold/10 border border-gold/20 text-gold text-xs font-bold hover:bg-gold/20 transition-all"
          >
            <CookingPot size={14} /> Resept Konstruktoru
          </button>
          <button
            onClick={() => setShowCookbookPanel(!showCookbookPanel)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all"
          >
            <BookOpen size={14} /> Kokbuk Yüklä {cookbookResults.length > 0 && (
              <span className={`bg-emerald-500 text-[10px] px-1.5 py-0.5 rounded-full ${lightMode ? 'text-gray-900' : 'text-white'}`}>{cookbookResults.length}</span>
            )}
          </button>
          <button
            onClick={() => setShowAiPanel(!showAiPanel)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold hover:bg-blue-500/20 transition-all"
          >
            <BrainCircuit size={14} /> AI Təkliflər {aiSuggestedRecipes.length > 0 && (
              <span className={`bg-blue-500 text-[10px] px-1.5 py-0.5 rounded-full ${lightMode ? 'text-gray-900' : 'text-white'}`}>{aiSuggestedRecipes.length}</span>
            )}
          </button>
          <button
            onClick={clearAllRecipes} disabled={clearingAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all active:scale-[0.97] disabled:opacity-30"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
          >
            {clearingAll ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Hamısını Sil
          </button>
        </div>
      </div>

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
                  <span className={`text-sm font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>AI Resept Təklifləri</span>
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
                <p className={`text-xs py-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Hazırda AI təklif yoxdur. "Yeni təkliflər yarat" basaraq satış data-sına əsasən təkliflər ala bilərsən.</p>
              )}

              <div className="space-y-2">
                {Array.from(new Set(aiSuggestedRecipes.map(r => r.menu_item_id))).map(pid => {
                  const prod = products.find(p => p.id === pid);
                  if (!prod) return null;
                  const prodRecipes = aiSuggestedRecipes.filter(r => r.menu_item_id === pid);
                  return (
                    <div key={pid} className={`rounded-xl border p-3 ${lightMode ? 'border-gray-200 bg-gray-50' : 'border-white/[0.06] bg-white/[0.03]'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Bot size={14} className="text-purple-400" />
                          <span className={`text-sm font-medium ${lightMode ? 'text-gray-900' : 'text-white'}`}>{getProductName(prod)}</span>
                          <span className="text-[10px] text-purple-400/60 bg-purple-500/10 px-1.5 py-0.5 rounded-full">AI Təklif</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => approveAi({ product_id: pid, product_name: getProductName(prod), total_sold: 0, recipe: prodRecipes.map(r => ({ ingredient_id: r.ingredient_id, ingredient_name: getIngredientName(r.ingredient_id), quantity_required: r.quantity_required, unit: '' })) })} className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-all">
                            <Check size={14} />
                          </button>
                          <button onClick={() => rejectAi(pid)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {prodRecipes.map(r => (
                          <div key={r.id} className={`flex items-center gap-2 text-xs ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>
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
                  <span className={`text-sm font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Kokbuk Parser</span>
                  <span className={`text-[10px] ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>PDF resept kitabını yüklə, AI hamısını parse edəcək</span>
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
                      <p className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>Kokbuk parse edilir, bu bir neçə saniyə çəkə bilər...</p>
                    </div>
                  ) : (
                    <>
                      <Upload size={28} className={`mx-auto mb-2 ${lightMode ? 'text-gray-300' : 'text-white/20'}`} />
                      <p className={`text-sm font-medium ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>Resept kitabını (PDF) bura sürüklə</p>
                      <p className={`text-xs mt-1 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>və ya kliklə seç — AI bütün reseptləri parse edəcək</p>
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
                    <div key={idx} className={`rounded-xl border p-3 ${lightMode ? 'border-gray-200 bg-gray-50' : 'border-white/[0.06] bg-white/[0.03]'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <BookOpen size={12} className="text-emerald-400" />
                          <span className={`text-sm font-medium ${lightMode ? 'text-gray-900' : 'text-white'}`}>{recipe.recipeName}</span>
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
                        <span className={`text-[10px] ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>Məhsul:</span>
                        <select
                          value={cookbookMatchMap[recipe.recipeName] || recipe.suggestedProductId || ''}
                          onChange={e => setCookbookMatchMap(prev => ({ ...prev, [recipe.recipeName]: e.target.value }))}
                          className={`flex-1 border rounded-lg px-2 py-1 text-xs outline-none focus:border-white/20 ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900' : 'bg-white/[0.04] border-white/[0.07] text-white'}`}
                        >
                          <option value="" className={lightMode ? 'bg-gray-100' : 'bg-[#1a1a1a]'}>Məhsul seç...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id} className={lightMode ? 'bg-gray-100' : 'bg-[#1a1a1a]'}>{getProductName(p)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        {recipe.ingredients.map((ing, i) => (
                          <div key={i} className={`flex items-center gap-2 text-xs ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/40" />
                            {ing.ingredient_name} × {ing.quantity_required} {ing.unit}
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
        <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${lightMode ? 'text-gray-300' : 'text-white/25'}`} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Məhsul axtar..."
          className={`w-full border rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none transition-all ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-gray-400' : 'bg-white/[0.04] border-white/[0.07] text-white placeholder:text-white/20 focus:border-white/25'}`}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className={`animate-spin ${lightMode ? 'text-gray-300' : 'text-white/20'}`} />
        </div>
      ) : (
        <div className="space-y-2">
          {filteredProducts.map(product => {
            const isExpanded = expandedProduct === product.id;
            const recs = productRecipes(product.id);
            const hasAi = recs.some(r => r.is_ai_suggested);
            const name = getProductName(product);
            return (
              <div key={product.id} className={`rounded-2xl border ${hasAi ? 'border-purple-500/20' : 'border-white/[0.06]'}overflow-hidden ${lightMode ? 'bg-gray-50' : 'bg-white/[0.02]'}`}>
                <button
                  onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-left ${lightMode ? 'hover:bg-gray-50' : 'hover:bg-white/[0.03]'}`}
                >
                  {product.image_url ? (
                    <img src={product.image_url} alt={name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-9 h-9 rounded-lg flex-shrink-0 ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${lightMode ? 'text-gray-900' : 'text-white'}`}>{name}</p>
                      {hasAi && <Sparkles size={11} className="text-purple-400 flex-shrink-0" />}
                    </div>
                    <p className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{product.price.toFixed(2)} ₼ · {recs.length} resept {hasAi && '· AI təklif var'}</p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className={lightMode ? 'text-gray-400' : 'text-white/30'} /> : <ChevronDown size={16} className={lightMode ? 'text-gray-400' : 'text-white/30'} />}
                </button>

                {isExpanded && (
                  <div className={`px-4 pb-4 border-t ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
                    {/* Document Upload Zone */}
                    <div className={`mt-3 rounded-xl border border-dashed p-3 ${lightMode ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-white/[0.02]'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <FileText size={13} className={lightMode ? 'text-gray-400' : 'text-white/30'} />
                        <span className={`text-[10px] uppercase tracking-wider font-semibold ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>AI Resept Parser</span>
                      </div>
                      {uploadTarget === product.id ? (
                        <div className="space-y-2">
                          <div
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleFileDrop}
                            className={`rounded-lg border border-dashed p-4 text-center transition-all ${dragOver ? 'border-blue-500/40 bg-blue-500/5' : 'border-white/10 bg-white/[0.02]'}`}
                          >
                            <Upload size={20} className={`mx-auto mb-1 ${lightMode ? 'text-gray-300' : 'text-white/20'}`} />
                            <p className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>PDF, Word və ya TXT faylını bura sürüklə</p>
                            <input type="file" accept=".txt,.pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" id={`file-${product.id}`} />
                            <label htmlFor={`file-${product.id}`} className="text-blue-400/70 text-xs cursor-pointer hover:text-blue-400">və ya kliklə seç</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>və ya yaz:</span>
                            <input
                              value={uploadText}
                              onChange={e => setUploadText(e.target.value)}
                              placeholder="Resept mətnini bura yaz..."
                              className={`flex-1 border rounded-lg px-2 py-1 text-xs placeholder:text-white/15 outline-none focus:border-white/20 ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900' : 'bg-white/[0.04] border-white/[0.07] text-white'}`}
                            />
                            <button
                              onClick={parseFromText}
                              disabled={uploadLoading || !uploadText.trim()}
                              className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold hover:bg-blue-500/20 transition-all disabled:opacity-30"
                            >
                              {uploadLoading ? <Loader2 size={10} className="animate-spin" /> : 'Parse'}
                            </button>
                            <button
                              onClick={() => { setUploadTarget(null); setUploadText(''); }}
                              className={`text-[10px] hover:text-white/40 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}
                            >
                              Ləğv
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setUploadTarget(product.id)}
                          className="flex items-center gap-2 text-blue-400/60 text-xs hover:text-blue-400 transition-all"
                        >
                          <Upload size={12} /> Resept sənədini yüklə (AI parse)
                        </button>
                      )}
                    </div>

                    {recs.length > 0 && (
                      <div className="space-y-1.5 mt-3">
                        {recs.map(r => (
                          <div key={r.id} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${r.is_ai_suggested ? 'bg-purple-500/[0.04] border-purple-500/15' : 'bg-white/[0.03] border-white/[0.05]'}`}>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${r.is_ai_suggested ? 'bg-purple-400/60' : 'bg-amber-400/60'}`} />
                              <span className={`text-sm ${lightMode ? 'text-gray-600' : 'text-white/70'}`}>{r.ingredient?.name || getIngredientName(r.ingredient_id)}</span>
                              <span className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>× {r.quantity_required} {r.ingredient?.unit || ''}</span>
                              {r.is_ai_suggested && <span className="text-[9px] text-purple-400/50 bg-purple-500/10 px-1 py-0.5 rounded">AI</span>}
                            </div>
                            <button onClick={() => handleDelete(r.id)} className={`w-7 h-7 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-all flex items-center justify-center ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick-add row */}
                    {addingFor === product.id ? (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={newIngredientId}
                          onChange={e => setNewIngredientId(e.target.value)}
                          className={`flex-1 border rounded-xl px-3 py-2 text-sm outline-none ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900 focus:border-gray-400' : 'bg-white/[0.04] border-white/[0.07] text-white focus:border-white/25'}`}
                        >
                          <option value="" className={lightMode ? 'bg-gray-100' : 'bg-[#1a1a1a]'}>Xəmmal seç</option>
                          {ingredients.map(i => (
                            <option key={i.id} value={i.id} className={lightMode ? 'bg-gray-100' : 'bg-[#1a1a1a]'}>{i.name} ({i.unit}) — {i.current_stock}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={newQuantity}
                          onChange={e => setNewQuantity(e.target.value)}
                          placeholder="Miqdar"
                          className={`w-28 border rounded-xl px-3 py-2 text-sm outline-none ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-gray-400' : 'bg-white/[0.04] border-white/[0.07] text-white placeholder:text-white/20 focus:border-white/25'}`}
                        />
                        <button
                          onClick={() => handleAdd(product.id)}
                          disabled={saving || !newIngredientId || !newQuantity}
                          className="px-3 py-2 rounded-xl bg-gold/10 border border-gold/20 text-gold text-xs font-bold hover:bg-gold/20 transition-all disabled:opacity-30"
                        >
                          {saving ? <Loader2 size={13} className="animate-spin" /> : 'Əlavə et'}
                        </button>
                        <button
                          onClick={() => { setAddingFor(null); setNewIngredientId(''); setNewQuantity(''); }}
                          className={`px-3 py-2 rounded-xl text-xs transition-all ${lightMode ? 'text-gray-400 hover:text-gray-600' : 'text-white/30 hover:text-white/60'}`}
                        >
                          Ləğv
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => { setEditConstructorProductId(product.id); setConstructorOpen(true); }}
                          className="flex items-center gap-2 text-gold/70 text-xs font-bold hover:text-gold transition-all"
                        >
                          <CookingPot size={13} /> Resept Konstruktoru
                        </button>
                        <span className={`text-[10px] ${lightMode ? 'text-gray-200' : 'text-white/10'}`}>|</span>
                        <button
                          onClick={() => setAddingFor(product.id)}
                          className={`flex items-center gap-2 text-xs font-bold hover:text-white/70 transition-all ${lightMode ? 'text-gray-400' : 'text-white/40'}`}
                        >
                          <Plus size={13} /> Sətir əlavə et
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className={`text-center py-16 text-sm ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>Məhsul tapılmadı</div>
          )}
        </div>
      )}

      {/* Recipe Constructor Modal */}
      <RecipeConstructorModal
        isOpen={constructorOpen}
        onClose={() => { setConstructorOpen(false); setEditConstructorProductId(undefined); }}
        onSaved={fetchData}
        editProductId={editConstructorProductId}
      />
    </div>
  );
}
