'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Search, Plus, Trash2, Loader2, CookingPot, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
  ingredient?: Ingredient;
}

export default function RecipesPage() {
  const { t, language } = useLanguage();
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, iRes, rRes] = await Promise.all([
        supabase.from('products').select('id, name, name_az, name_en, name_ru, image_url, price').order('name_az'),
        supabase.from('ingredients').select('id, name, unit, current_stock').order('name'),
        supabase.from('recipes').select('id, menu_item_id, ingredient_id, quantity_required'),
      ]);
      setProducts((pRes.data || []) as Product[]);
      setIngredients((iRes.data || []) as Ingredient[]);
      setRecipes((rRes.data || []) as RecipeRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

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
    if (isNaN(qty) || qty <= 0) {
      toast.error('Miqdar düzgün deyil');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('recipes').insert({
      menu_item_id: productId,
      ingredient_id: newIngredientId,
      quantity_required: qty,
    });
    if (error) toast.error('Xəta: ' + error.message);
    else {
      toast.success('Resept əlavə edildi');
      setNewIngredientId('');
      setNewQuantity('');
      setAddingFor(null);
      fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async (recipeId: string) => {
    const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
    if (error) toast.error('Xəta');
    else { toast.success('Silindi'); fetchData(); }
  };

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
          <CookingPot size={18} className="text-gold" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Reseptlər</h1>
          <p className="text-white/30 text-xs">Hər məhsulun hazırlanması üçün tələb olunan xəmmal</p>
        </div>
      </div>

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
            const name = getProductName(product);
            return (
              <div key={product.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <button
                  onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-all text-left"
                >
                  {product.image_url ? (
                    <img src={product.image_url} alt={name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-white/[0.05] flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{name}</p>
                    <p className="text-white/30 text-xs">{product.price.toFixed(2)} ₼ · {recs.length} resept</p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/[0.05]">
                    {recs.length > 0 && (
                      <div className="space-y-1.5 mt-3">
                        {recs.map(r => (
                          <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-400/60" />
                              <span className="text-white/70 text-sm">{r.ingredient?.name || getIngredientName(r.ingredient_id)}</span>
                              <span className="text-white/30 text-xs">× {r.quantity_required} {r.ingredient?.unit || ''}</span>
                            </div>
                            <button onClick={() => handleDelete(r.id)} className="w-7 h-7 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all flex items-center justify-center">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {addingFor === product.id ? (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={newIngredientId}
                          onChange={e => setNewIngredientId(e.target.value)}
                          className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/25"
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
                          className="w-28 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
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
                          className="px-3 py-2 rounded-xl text-white/30 text-xs hover:text-white/60 transition-all"
                        >
                          Ləğv
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingFor(product.id)}
                        className="mt-3 flex items-center gap-2 text-gold/70 text-xs font-bold hover:text-gold transition-all"
                      >
                        <Plus size={13} /> Resept əlavə et
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="text-center py-16 text-white/20 text-sm">Məhsul tapılmadı</div>
          )}
        </div>
      )}
    </div>
  );
}
