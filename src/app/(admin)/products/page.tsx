'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Product, Category } from '@/types';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

import { ProductTable } from './components/ProductTable';
import { ProductModal } from './components/ProductModal';
import { ProductBulkModals } from './components/ProductBulkModals';
import { ProductCategoryModal } from './components/ProductCategoryModal';
import { DeleteAllModal, DeleteProductModal, DeleteCategoryModal } from './components/ProductDeleteModals';
import { ProductsLoader } from './components/ProductsLoader';

/* ─── Helpers ─── */
const normalizeProductName = (s: string) => s.trim();

export type ProductVariantForm = { id?: string; name: string; price: string; is_default: boolean; variant_type?: 'olcu'; translations?: Record<string, { name: string }> | null; };
export type ProductModifierForm = { id?: string; name: string; price: string; is_available: boolean; translations?: Record<string, { name: string }> | null; };

type ProductForm = {
  name: string; category_id: string; price: string; image_url: string;
  description: string; ingredients: string; is_in_stock: boolean;
  is_special: boolean; is_spicy: boolean;
  is_ready_product: boolean; direct_ingredient_id: string;
  name_en: string; name_ru: string; description_en: string; description_ru: string;
  ingredients_en: string; ingredients_ru: string;
  variants: ProductVariantForm[];
  modifiers: ProductModifierForm[];
};

type CategoryForm = { id: string; name: string; slug: string; image_url: string };

const emptyProductForm = (defaultCatId = ''): ProductForm => ({
  name: '', category_id: defaultCatId, price: '', image_url: '',
  description: '', ingredients: '', is_in_stock: true,
  is_special: false, is_spicy: false,
  is_ready_product: false, direct_ingredient_id: '',
  name_en: '', name_ru: '', description_en: '', description_ru: '',
  ingredients_en: '', ingredients_ru: '',
  variants: [],
  modifiers: [],
});

const emptyCategoryForm = (): CategoryForm => ({ id: '', name: '', slug: '', image_url: '' });

const ProductsPage = () => {
  const { t, language, getProductTranslation, getCategoryTranslation } = useLanguage();

  /* ─── Data state ─── */
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const r = localStorage.getItem('saito_products_cache');
      const parsed = r ? JSON.parse(r) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const r = localStorage.getItem('saito_categories_cache');
      const parsed = r ? JSON.parse(r) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try { return !localStorage.getItem('saito_products_cache'); } catch { return true; }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(() => {
    try { const r = localStorage.getItem('saito_expanded_categories'); return r ? JSON.parse(r) : []; } catch { return []; }
  });

  /* ─── Modal state ─── */
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [updating, setUpdating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  /* ─── Bulk actions state ─── */
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkAction, setBulkAction] = useState<'stock' | 'category' | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  /* ─── Confirmation state ─── */
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<{ id: string; name: string } | null>(null);

  /* ─── Form state ─── */
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm());
  const [priceError, setPriceError] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [catNameError, setCatNameError] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategoryForm());

  /* ─── Bulk action handlers ─── */
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  };

  const selectAllProducts = (categoryId: string) => {
    const safeProducts = Array.isArray(products) ? products : [];
    const ids = safeProducts.filter(p => p.category_id === categoryId).map(p => p.id);
    const allSelected = ids.every(id => selectedProducts.has(id));
    if (allSelected) setSelectedProducts(prev => new Set([...prev].filter(id => !ids.includes(id))));
    else setSelectedProducts(prev => new Set([...prev, ...ids]));
  };

  const handleBulkStockUpdate = async (inStock: boolean) => {
    if (selectedProducts.size === 0) {
      toast.error(t('select_products_first'), { id: 'action-toast', icon: '⚠️' });
      return;
    }
    if (bulkUpdating) return;
    setBulkUpdating(true);
    try {
      const { error } = await supabase.from('products').update({ is_in_stock: inStock }).in('id', Array.from(selectedProducts));
      if (error) throw error;
      toast.success(`${selectedProducts.size} ${t('products_stock_updated')}`, { id: 'action-toast' });
      fetchData(); setIsBulkMode(false); setSelectedProducts(new Set()); setBulkAction(null);
    } catch (e: any) { toast.error(e?.message || t('error'), { id: 'action-toast' }); }
    finally { setBulkUpdating(false); }
  };

  const handleBulkCategoryUpdate = async (categoryId: string) => {
    if (selectedProducts.size === 0) {
      toast.error(t('select_products_first'), { id: 'action-toast', icon: '⚠️' });
      return;
    }
    if (bulkUpdating) return;
    setBulkUpdating(true);
    try {
      const { error } = await supabase.from('products').update({ category_id: categoryId }).in('id', Array.from(selectedProducts));
      if (error) throw error;
      toast.success(`${selectedProducts.size} ${t('products_moved_to_category')}`, { id: 'action-toast' });
      fetchData(); setIsBulkMode(false); setSelectedProducts(new Set()); setBulkAction(null);
    } catch (e: any) { toast.error(e?.message || t('error'), { id: 'action-toast' }); }
    finally { setBulkUpdating(false); }
  };

  /* ─── Effects ─── */
  useEffect(() => { fetchData(); }, []); // always refresh in background

  const didAutoTranslate = useRef(false);
  useEffect(() => {
    if (language === 'az' || products.length === 0 || didAutoTranslate.current) return;
    didAutoTranslate.current = true;
    autoTranslateMissing(language, products, categories);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  /* ─── Auto-translate ─── */
  const autoTranslateMissing = async (lang: string, prods: typeof products, cats: typeof categories) => {
    if (lang === 'az') return;
    const langName = lang === 'en' ? 'English' : lang === 'ru' ? 'Russian' : lang;
    const batchXlate = async (fields: Record<string, string>): Promise<Record<string, string>> => {
      try {
        const res = await fetch('/api/translate-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields, languages: [langName] }) });
        if (!res.ok) return {};
        const d = await res.json();
        return (d.result?.[langName] as Record<string, string>) ?? {};
      } catch { return {}; }
    };
    const flatLang = `name_${lang}` as string;
    const catEntries = cats.filter(cat => !(cat as any)[flatLang]);
    const catResults = await Promise.all(catEntries.map(async (cat) => {
      const tr = await batchXlate({ name: cat.name });
      if (!tr.name) return null;
      await supabase.from('categories').update({ [`name_${lang}`]: tr.name }).eq('id', cat.id);
      return { id: cat.id, name: tr.name };
    }));
    const catUpdates: Record<string, string> = {};
    for (const r of catResults) { if (r) catUpdates[r.id] = r.name; }
    if (Object.keys(catUpdates).length > 0) {
      setCategories(prev => prev.map(c => catUpdates[c.id] ? { ...c, [`name_${lang}`]: catUpdates[c.id] } : c));
    }
    const prodEntries = prods.filter(p => !(p as any)[flatLang]);
    const prodResults = await Promise.all(prodEntries.map(async (product) => {
      const fields: Record<string, string> = { name: product.name };
      if (product.description) fields.description = product.description;
      const ingr = Array.isArray(product.ingredients) ? product.ingredients.join(', ') : '';
      if (ingr) fields.ingredients = ingr;
      const tr = await batchXlate(fields);
      if (!tr.name) return null;
      const flatCols: Record<string, string> = { [`name_${lang}`]: tr.name };
      if (tr.description) flatCols[`description_${lang}`] = tr.description;
      if (tr.ingredients || ingr) flatCols[`ingredients_${lang}`] = tr.ingredients || ingr;
      await supabase.from('products').update(flatCols).eq('id', product.id);
      return { id: product.id, flatCols };
    }));
    const prodUpdates: Record<string, Record<string, string>> = {};
    for (const r of prodResults) { if (r) prodUpdates[r.id] = r.flatCols; }
    if (Object.keys(prodUpdates).length > 0) setProducts(prev => prev.map(p => prodUpdates[p.id] ? { ...p, ...prodUpdates[p.id] } : p));
  };

  /* ─── Data fetching ─── */
  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*, category:categories(*), variants:product_variants(id,name,price,image_url,variant_type,parent_variant_id,is_in_stock,views_count,translations)').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      const freshProducts = Array.isArray(productsRes.data) ? productsRes.data : [];
      const freshCategories = Array.isArray(categoriesRes.data) ? categoriesRes.data : [];
      setProducts(freshProducts);
      setCategories(freshCategories);
      try { localStorage.setItem('saito_products_cache', JSON.stringify(freshProducts)); } catch {}
      try { localStorage.setItem('saito_categories_cache', JSON.stringify(freshCategories)); } catch {}
      if (language !== 'az') autoTranslateMissing(language, freshProducts, freshCategories);
      const uniqueCatIds = Array.from(new Set(freshProducts.map(p => p.category_id))).filter(Boolean) as string[];
      setExpandedCategories(prev => {
        if (prev.length === 0) {
          try { localStorage.setItem('saito_expanded_categories', JSON.stringify(uniqueCatIds)); } catch {}
          return uniqueCatIds;
        }
        return prev;
      });
      if (freshCategories.length > 0 && !productForm.category_id) setProductForm(prev => ({ ...prev, category_id: freshCategories[0].id }));
    } catch (error: any) { toast.error('Məlumatları yükləmək mümkün olmadı: ' + error.message, { id: 'action-toast' }); }
    finally { setLoading(false); }
  };

  /* ─── Category handlers ─── */
  const toSlug = (s: string) => s.toLowerCase()
    .replace(/ə/g, 'e').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i̇/g, 'i')
    .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const openCategoryModal = (category?: Category) => {
    if (category) {
      const localName = (category as any)[`name_${language}`] || category.name;
      setCategoryForm({ id: category.id, name: localName, slug: toSlug(localName), image_url: category.image_url || '' });
    } else {
      setCategoryForm(emptyCategoryForm());
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) { setCatNameError(true); return; }
    setCatNameError(false);
    setUpdating(true);
    const categoryData = { name: categoryForm.name, slug: categoryForm.slug, image_url: categoryForm.image_url };
    const langToLabel: Record<string, string> = { az: 'Azerbaijani', en: 'English', ru: 'Russian' };
    const sourceLangLabel = langToLabel[language] || 'auto-detect';
    let name_az = categoryForm.name, name_en = '', name_ru = '';
    try {
      const res = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { name: categoryForm.name },
          languages: ['Azerbaijani', 'English', 'Russian'],
          sourceLanguage: 'auto-detect',
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.result?.Azerbaijani?.name) name_az = d.result.Azerbaijani.name;
        if (d.result?.English?.name)     name_en = d.result.English.name;
        if (d.result?.Russian?.name)     name_ru = d.result.Russian.name;
      }
    } catch { /* silent */ }
    const allNamesForType = [name_az, name_en, name_ru].join(' ');
    const haystackType = allNamesForType.replace(/İ/g, 'i').replace(/ı/g, 'i').toLowerCase();
    const catType: 'drink' | 'dessert' | 'food' =
      /i[çc]kil?|drink|beverage|juice|soda|water|\bsu\b|[çc]ay|tea|coffee|q[əe]hv|kofe|limon|smoothie|milkshake|lemonade/.test(haystackType) ? 'drink'
      : /dondurm[aа]|ice.?cream|dessert|tatl[iı]|şirniyyat|cake|tort|waffle|baklava|şokolad|chocolate|pudding/.test(haystackType) ? 'dessert'
      : 'food';
    categoryData.name = name_az || categoryForm.name;
    const flatCatCols = { name_az, name_en, name_ru, category_type: catType };
    let error;
    if (categoryForm.id) {
      const { error: err } = await supabase.from('categories').update({ ...categoryData, ...flatCatCols }).eq('id', categoryForm.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('categories').insert([{ ...categoryData, ...flatCatCols }]);
      error = err;
    }
    if (error) { toast.error(t('error') + ': ' + error.message, { id: 'action-toast' }); }
    else {
      toast.success(categoryForm.id ? t('category_updated') : t('category_created'), { id: 'action-toast' });
      setCategoryForm(emptyCategoryForm());
      fetchData();
      if (!categoryForm.id) setIsCategoryModalOpen(false);
    }
    setUpdating(false);
  };

  /* ─── Derived data ─── */
  const { isDrinkCategory, isNonSpicyCategory } = useMemo(() => {
    const safeCategories = Array.isArray(categories) ? categories : [];
    const cat = safeCategories.find(c => c.id === productForm.category_id);
    if (!cat) return { isDrinkCategory: false, isNonSpicyCategory: false };
    const dbType = (cat as any).category_type as string | undefined;
    if (dbType === 'drink')   return { isDrinkCategory: true,  isNonSpicyCategory: true };
    if (dbType === 'dessert') return { isDrinkCategory: false, isNonSpicyCategory: true };
    if (dbType === 'food')    return { isDrinkCategory: false, isNonSpicyCategory: false };
    const allNames = [cat.name, (cat as any).slug || '', (cat as any).name_en || '', (cat as any).name_ru || ''].join(' ');
    const haystack = allNames.replace(/İ/g, 'i').replace(/ı/g, 'i').toLowerCase();
    const drink = /i[çc]kil?|drink|beverage|juice|soda|water|\bsu\b|[çc]ay|tea|coffee|q[əe]hv|kofe|limon|smoothie|milkshake|lemonade/.test(haystack);
    const dessert = /dondurm[aа]|ice.?cream|dessert|tatl[iı]|şirniyyat|cake|tort|waffle|baklava|şokolad|chocolate|pudding/.test(haystack);
    return { isDrinkCategory: drink, isNonSpicyCategory: drink || dessert };
  }, [productForm.category_id, categories]);

  // Reset flags when category hides the corresponding toggle
  useEffect(() => {
    if (isDrinkCategory && productForm.is_special) {
      setProductForm(prev => ({ ...prev, is_special: false }));
    }
    if (isNonSpicyCategory && productForm.is_spicy) {
      setProductForm(prev => ({ ...prev, is_spicy: false }));
    }
  }, [isDrinkCategory, isNonSpicyCategory]);

  const groupedProducts = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    const safeCategories = Array.isArray(categories) ? categories : [];
    const filtered = safeProducts.filter(p => {
      const translatedName = getProductTranslation(p).name;
      return translatedName.toLowerCase().includes(searchQuery.toLowerCase()) || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    });
    return filtered.reduce((acc: { [key: string]: { name: string; products: Product[] } }, product) => {
      const catId = product.category_id || 'unassigned';
      const freshCat = safeCategories.find(c => c.id === catId);
      const catName = freshCat ? ((freshCat as any)[`name_${language}`] || freshCat.name) : t('uncategorized');
      if (!acc[catId]) acc[catId] = { name: catName, products: [] };
      acc[catId].products.push(product);
      return acc;
    }, {});
  }, [products, categories, searchQuery, language, t]);

  /* ─── Product handlers ─── */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `products/${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath);
      setProductForm(prev => ({ ...prev, image_url: publicUrl }));
      toast.success(t('image_uploaded'), { id: 'action-toast' });
      try {
        const visionRes = await fetch('/api/vision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: publicUrl, language }) });
        const visionData = await visionRes.json();
        if (visionData.name || visionData.ingredients) {
          setProductForm(prev => ({ ...prev, name: visionData.name ? normalizeProductName(visionData.name) : prev.name, ingredients: visionData.ingredients || prev.ingredients }));
          toast.success('🔍 AI şəkili analiz etdi', { id: 'action-toast', icon: '✨' });
        }
      } catch { /* vision silent */ }
    } catch (error: any) { toast.error(t('image_upload_failed') + ': ' + error.message, { id: 'action-toast' }); }
    finally { setUploadingImage(false); }
  };

  const openEditModal = async (product: Product) => {
    const isSameProduct = editingProduct?.id === product.id;
    setEditingProduct(product);
    const localName = (product as any)[`name_${language}`] || product.name;
    const localDesc = (product as any)[`description_${language}`] || product.description || '';
    const localIngr = (product as any)[`ingredients_${language}`] || product.ingredients?.join(', ') || '';
    if (isSameProduct) {
      setProductForm(prev => ({ ...prev, name: localName, description: localDesc, ingredients: localIngr }));
      setIsModalOpen(true);
      return;
    }
    const [{ data: variantRows }, { data: modifierRows }] = await Promise.all([
      supabase.from('product_variants').select('*').eq('product_id', product.id).order('is_default', { ascending: false }),
      supabase.from('product_modifiers').select('*').eq('product_id', product.id).order('created_at', { ascending: true }),
    ]);
    setProductForm({
      name: localName, category_id: product.category_id, price: product.price.toString(),
      image_url: product.image_url, description: localDesc,
      ingredients: localIngr,
      is_in_stock: product.is_in_stock, is_special: product.is_special || false, is_spicy: product.is_spicy || false,
      is_ready_product: (product as any).is_ready_product || false,
      direct_ingredient_id: (product as any).direct_ingredient_id || '',
      name_en: (product as any).name_en || '', name_ru: (product as any).name_ru || '',
      description_en: (product as any).description_en || '', description_ru: (product as any).description_ru || '',
      ingredients_en: (product as any).ingredients_en || '', ingredients_ru: (product as any).ingredients_ru || '',
      variants: (variantRows || []).map(v => ({ id: v.id, name: v.name, price: v.price.toString(), is_default: v.is_default, variant_type: 'olcu' as const, translations: (v as any).translations || null })),
      modifiers: (modifierRows || []).map(m => ({ id: m.id, name: m.name, price: m.price.toString(), is_available: m.is_available, translations: (m as any).translations || null })),
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (updating) return;
    if (!productForm.name.trim()) { setNameError(true); return; }
    setNameError(false);
    if (!productForm.price || isNaN(parseFloat(productForm.price)) || parseFloat(productForm.price) <= 0) { setPriceError(true); return; }
    setPriceError(false);
    if (!productForm.category_id) { toast.error(t('select_category'), { id: 'action-toast' }); return; }
    if (productForm.is_ready_product && !productForm.direct_ingredient_id) {
      toast.error('Hazır məhsul üçün xammal seçilməlidir', { id: 'action-toast' });
      return;
    }
    setUpdating(true);
    const productData = {
      name: productForm.name, category_id: productForm.category_id, price: parseFloat(productForm.price),
      image_url: productForm.image_url, description: productForm.description,
      ingredients: productForm.ingredients.split(',').map(i => i.trim()).filter(Boolean),
      is_in_stock: productForm.is_in_stock, is_special: productForm.is_special, is_spicy: productForm.is_spicy,
      is_ready_product: productForm.is_ready_product,
      direct_ingredient_id: productForm.is_ready_product ? productForm.direct_ingredient_id || null : null,
      views_count: editingProduct ? editingProduct.views_count : 0,
    };
    let error; let savedProduct: Product | null = null;
    if (editingProduct) {
      const { error: err } = await supabase.from('products').update(productData).eq('id', editingProduct.id);
      error = err; savedProduct = { ...editingProduct, ...productData } as Product;
    } else {
      const { data, error: err } = await supabase.from('products').insert([productData]).select().single();
      error = err; savedProduct = data;
    }
    if (error) {
      console.error('[Products Save]', error);
      toast.error((error as any)?.message || t('error_sql_update'), { id: 'action-toast' });
    }
    else if (savedProduct) {
        // ─── Variant CRUD (olcu only) ───
        const validVariants = productForm.variants.filter(v => v.name.trim() && v.price.trim() && !isNaN(parseFloat(v.price)));
        const translationMap = new Map<string, Record<string, { name: string }>>();
        if (validVariants.length > 0) {
          await Promise.all(validVariants.map(async (v) => {
            try {
              const langNameMap: Record<string, string> = { az: 'Azerbaijani', en: 'English', ru: 'Russian' };
              const sourceLang = langNameMap[language] ?? 'Azerbaijani';
              const res = await fetch('/api/translate-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { name: v.name.trim() }, languages: ['Azerbaijani', 'English', 'Russian'], sourceLanguage: sourceLang }) });
              if (!res.ok) return;
              const d = await res.json();
              const tr: Record<string, { name: string }> = {};
              if (d.result?.Azerbaijani?.name) tr.az = { name: d.result.Azerbaijani.name };
              if (d.result?.English?.name) tr.en = { name: d.result.English.name };
              if (d.result?.Russian?.name) tr.ru = { name: d.result.Russian.name };
              if (Object.keys(tr).length) translationMap.set(v.name.trim(), tr);
            } catch { /* silent */ }
          }));
        }
        const getTranslations = (v: ProductVariantForm) => v.translations || translationMap.get(v.name.trim()) || null;
        if (editingProduct) {
          const { data: existing } = await supabase.from('product_variants').select('id').eq('product_id', savedProduct.id);
          const existingIds = (existing || []).map((r: any) => r.id);
          const keptIds = validVariants.filter(v => v.id).map(v => v.id as string);
          const toDelete = existingIds.filter((id: string) => !keptIds.includes(id));
          if (toDelete.length) await supabase.from('product_variants').delete().in('id', toDelete);
        }
        for (const v of validVariants) {
          const vData = { product_id: savedProduct.id, name: v.name.trim(), price: parseFloat(v.price) || 0, is_default: v.is_default, discount_price: null as null, image_url: null, variant_type: 'olcu' as const, description: null, ingredients: null, is_special: false, is_spicy: false, parent_variant_id: null as null, translations: getTranslations(v) };
          if (v.id) { await supabase.from('product_variants').update(vData).eq('id', v.id); }
          else { await supabase.from('product_variants').insert([vData]); }
        }
        // ─── Modifier CRUD ───
        const validModifiers = productForm.modifiers.filter(m => m.name.trim());
        if (editingProduct) {
          const { data: existingMods } = await supabase.from('product_modifiers').select('id').eq('product_id', savedProduct.id);
          const existingModIds = (existingMods || []).map((r: any) => r.id);
          const keptModIds = validModifiers.filter(m => m.id).map(m => m.id as string);
          const toDeleteMods = existingModIds.filter((id: string) => !keptModIds.includes(id));
          if (toDeleteMods.length) await supabase.from('product_modifiers').delete().in('id', toDeleteMods);
        }
        for (const m of validModifiers) {
          const mData = { product_id: savedProduct.id, name: m.name.trim(), price: parseFloat(m.price) || 0, is_available: m.is_available, translations: m.translations || null };
          if (m.id) { await supabase.from('product_modifiers').update(mData).eq('id', m.id); }
          else { await supabase.from('product_modifiers').insert([mData]); }
        }
        // ─── Campaign price ───
        const { data: campaigns } = await supabase.from('campaigns').select('*').eq('status', 'active').eq('target_type', 'category').eq('target_id', savedProduct.category_id);
        if (campaigns && campaigns.length > 0) {
          const campaign = campaigns[0];
          if (campaign.type === 'PERCENTAGE' && campaign.discount_value)
            await supabase.from('products').update({ discount_price: savedProduct.price * (1 - campaign.discount_value / 100) }).eq('id', savedProduct.id);
        }
        try {
          const langToLabel: Record<string, string> = { az: 'Azerbaijani', en: 'English', ru: 'Russian' };
          const otherLangs = (['az', 'en', 'ru'] as const).filter(l => l !== language);
          const ingrStr = Array.isArray(productForm.ingredients) ? (productForm.ingredients as string[]).join(', ') : (productForm.ingredients || '');

          // Detect which fields changed vs saved DB values
          const prevName = editingProduct ? ((editingProduct as any)[`name_${language}`] || editingProduct.name) : null;
          const prevDesc = editingProduct ? ((editingProduct as any)[`description_${language}`] || (typeof editingProduct.description === 'string' ? editingProduct.description : (editingProduct.description as any)?.az || '') || '') : null;
          const prevIngrRaw = editingProduct ? (editingProduct.ingredients || []) : null;
          const prevIngr = editingProduct ? ((editingProduct as any)[`ingredients_${language}`] || (Array.isArray(prevIngrRaw) ? (prevIngrRaw as any[]).map((i: any) => (typeof i === 'string' ? i : i?.az || '')).filter(Boolean).join(', ') : '')) : null;

          const nameChanged = !editingProduct || productForm.name !== prevName;
          const descChanged = !editingProduct || productForm.description !== prevDesc;
          const ingrChanged = !editingProduct || ingrStr !== prevIngr;

          const flat: Record<string, string> = {
            [`name_${language}`]: productForm.name,
            [`description_${language}`]: productForm.description || '',
            [`ingredients_${language}`]: ingrStr,
          };
          if (!flat.name_az) flat.name_az = productForm.name;

          const fieldsToTranslate: Record<string, string> = {};
          if (nameChanged) fieldsToTranslate.name = productForm.name;
          if (descChanged && productForm.description) fieldsToTranslate.description = productForm.description;
          if (ingrChanged && ingrStr) fieldsToTranslate.ingredients = ingrStr;

          const missingLangs = otherLangs.filter(l => !flat[`name_${l}`]);
          const changedLangs = (nameChanged || descChanged || ingrChanged) ? otherLangs : missingLangs;
          const langsForTranslate = Array.from(new Set([...missingLangs, ...changedLangs]));

          if (langsForTranslate.length > 0 && Object.keys(fieldsToTranslate).length > 0) {
            let attempt = 0;
            let success = false;
            while (attempt < 3 && !success) {
              attempt++;
              try {
                const res = await fetch('/api/translate-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: fieldsToTranslate, languages: langsForTranslate.map(l => langToLabel[l]), sourceLanguage: 'auto-detect' }) });
                if (res.ok) {
                  const d = await res.json();
                  if (nameChanged) {
                    if (!flat.name_az && d.result?.Azerbaijani?.name) flat.name_az = d.result.Azerbaijani.name;
                    if (!flat.name_en && d.result?.English?.name) flat.name_en = d.result.English.name;
                    if (!flat.name_ru && d.result?.Russian?.name) flat.name_ru = d.result.Russian.name;
                  }
                  if (descChanged) {
                    if (d.result?.Azerbaijani?.description) flat.description_az = d.result.Azerbaijani.description;
                    if (d.result?.English?.description) flat.description_en = d.result.English.description;
                    if (d.result?.Russian?.description) flat.description_ru = d.result.Russian.description;
                  }
                  if (ingrChanged) {
                    if (d.result?.Azerbaijani?.ingredients) flat.ingredients_az = d.result.Azerbaijani.ingredients;
                    if (d.result?.English?.ingredients) flat.ingredients_en = d.result.English.ingredients;
                    if (d.result?.Russian?.ingredients) flat.ingredients_ru = d.result.Russian.ingredients;
                  }
                  success = true;
                }
              } catch { /* retry */ }
            }
            if (nameChanged) {
              if (!flat.name_az) flat.name_az = productForm.name;
              if (!flat.name_en) flat.name_en = productForm.name;
              if (!flat.name_ru) flat.name_ru = productForm.name;
            }
          }
          await supabase.from('products').update(flat).eq('id', savedProduct.id);
        } catch { /* silent */ }

      // ─── Translate variant names ───
      const validVarItems = productForm.variants.filter(v => v.name.trim());
      if (validVarItems.length > 0) {
        try {
          const varItems = validVarItems.map(v => ({ key: v.id || v.name.trim(), name: v.name.trim() }));
          let vAttempt = 0;
          let vSuccess = false;
          let vBatch: Record<string, Record<string, { name?: string }>> = {};
          while (vAttempt < 3 && !vSuccess) {
            vAttempt++;
            try {
              const vRes = await fetch('/api/translate-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variants: varItems, languages: ['English', 'Russian'] }),
              });
              if (vRes.ok) { const vData = await vRes.json(); vBatch = vData.result || {}; vSuccess = true; }
            } catch { /* retry */ }
          }
          for (const v of validVarItems) {
            const tr = vBatch[v.id || v.name.trim()];
            const flatV: Record<string, string> = {
              name_az: v.name.trim(),
              name_en: tr?.en?.name || v.name.trim(),
              name_ru: tr?.ru?.name || v.name.trim(),
            };
            if (v.id) { await supabase.from('product_variants').update(flatV).eq('id', v.id); }
          }
        } catch { /* silent */ }
      }

      // ─── Translate modifier names ───
      const validModItems = productForm.modifiers.filter(m => m.name.trim());
      if (validModItems.length > 0) {
        try {
          const modItems = validModItems.map(m => ({ key: m.id || m.name.trim(), name: m.name.trim() }));
          let mAttempt = 0;
          let mSuccess = false;
          let mBatch: Record<string, Record<string, { name?: string }>> = {};
          while (mAttempt < 3 && !mSuccess) {
            mAttempt++;
            try {
              const mRes = await fetch('/api/translate-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variants: modItems, languages: ['English', 'Russian'] }),
              });
              if (mRes.ok) { const mData = await mRes.json(); mBatch = mData.result || {}; mSuccess = true; }
            } catch { /* retry */ }
          }
          for (const m of validModItems) {
            const tr = mBatch[m.id || m.name.trim()];
            const flatM: Record<string, string> = {
              name_az: m.name.trim(),
              name_en: tr?.en?.name || m.name.trim(),
              name_ru: tr?.ru?.name || m.name.trim(),
            };
            if (m.id) { await supabase.from('product_modifiers').update(flatM).eq('id', m.id); }
          }
        } catch { /* silent */ }
      }

      toast.success(editingProduct ? t('product_updated') : t('product_created'), { id: 'action-toast' });
      setIsModalOpen(false);
      const { data: freshVariants } = await supabase.from('product_variants').select('*').eq('product_id', savedProduct!.id).order('is_default', { ascending: false });
      if (freshVariants) setProductForm(prev => ({ ...prev, variants: freshVariants.map(v => ({ id: v.id, name: v.name, price: v.price.toString(), is_default: v.is_default, variant_type: 'olcu' as const, translations: null })) }));
      fetchData();
    }
    setUpdating(false);
  };


  const handleToggleStock = async (product: Product) => {
    if (updating) return;
    const { error } = await supabase.from('products').update({ is_in_stock: !product.is_in_stock }).eq('id', product.id);
    if (error) toast.error(t('status_not_updated'), { id: 'action-toast' });
    else { toast.success(product.is_in_stock ? t('product_removed') : t('product_restored'), { id: 'action-toast' }); fetchData(); }
  };

  const handleDeleteAll = async () => {
    if (updating) return;
    setUpdating(true); setConfirmDeleteAll(false);
    try {
      const { error } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      toast.success(t('all_products_deleted'), { id: 'action-toast' }); fetchData();
    } catch (error: any) { toast.error(t('error') + ': ' + error.message, { id: 'action-toast' }); }
    finally { setUpdating(false); }
  };

  const confirmDeleteProductAction = async () => {
    if (!confirmDeleteProduct || updating) return;
    const { id } = confirmDeleteProduct;
    setConfirmDeleteProduct(null);
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) toast.error(t('product_not_deleted'), { id: 'action-toast' });
    else { toast.success(t('product_deleted'), { id: 'action-toast' }); fetchData(); }
  };

  const confirmDeleteCategoryAction = async () => {
    if (!confirmDeleteCategory || loading) return;
    setConfirmDeleteCategory(null);
    setLoading(true);
    const { error } = await supabase.from('categories').delete().eq('id', confirmDeleteCategory.id);
    if (error) toast.error(t('category_not_deleted') + ': ' + error.message, { id: 'action-toast' });
    else { toast.success(t('category_deleted'), { id: 'action-toast' }); fetchData(); }
    setLoading(false);
  };

  /* ─── Helpers passed down ─── */
  const getCategoryName = (cat: Category) => getCategoryTranslation(cat).name;
  const getProductName = (p: Product) => getProductTranslation(p).name;

  if (loading) return <ProductsLoader />;

  /* ─── Render ─── */
  return (
    <div className="space-y-6 pb-24">
      {/* Header - daha çox boşluq */}
      <div className="px-4 sm:px-0">
        <h2 className="text-3xl font-serif font-bold text-white tracking-tight mb-2">{t('products_title')}</h2>
        <p className="text-white/40 text-xs uppercase tracking-[0.2em]">{t('products_subtitle')}</p>
      </div>

      <ProductTable
        products={products}
        categories={categories}
        groupedProducts={groupedProducts}
        searchQuery={searchQuery}
        isBulkMode={isBulkMode}
        selectedProducts={selectedProducts}
        expandedCategories={expandedCategories}
        updating={updating}
        onSearchChange={setSearchQuery}
        onOpenAddModal={() => { setEditingProduct(null); setProductForm(emptyProductForm(categories[0]?.id || '')); setIsModalOpen(true); }}
        onOpenCategoryModal={() => openCategoryModal()}
        onEditProduct={openEditModal}
        onDeleteProduct={(id: string, name: string) => setConfirmDeleteProduct({ id, name })}
        onToggleStock={handleToggleStock}
        onToggleCategory={(catId: string) => setExpandedCategories(prev => {
          const next = prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId];
          try { localStorage.setItem('saito_expanded_categories', JSON.stringify(next)); } catch {}
          return next;
        })}
        onToggleProductSelection={toggleProductSelection}
        onSelectAllProducts={selectAllProducts}
        onSetBulkMode={setIsBulkMode}
        onSetBulkAction={setBulkAction}
        onConfirmDeleteAll={() => setConfirmDeleteAll(true)}
        onEditCategory={openCategoryModal}
        onDeleteCategory={(id, name) => setConfirmDeleteCategory({ id, name })}
        getCategoryName={getCategoryName}
        getProductName={getProductName}
      />

      <ProductModal
        open={isModalOpen}
        editingProduct={editingProduct}
        productForm={productForm}
        categories={categories}
        isDrinkCategory={isDrinkCategory}
        isNonSpicyCategory={isNonSpicyCategory}
        updating={updating}
        nameError={nameError}
        priceError={priceError}
        onClose={() => setIsModalOpen(false)}
        onFormChange={setProductForm}
        onNameErrorChange={setNameError}
        onPriceErrorChange={setPriceError}
        onSubmit={handleSave}
        getCategoryName={getCategoryName}
        normalizeProductName={normalizeProductName}
      />

      <ProductBulkModals
        bulkAction={bulkAction}
        selectedCount={selectedProducts.size}
        categories={categories}
        bulkUpdating={bulkUpdating}
        onClose={() => setBulkAction(null)}
        onStockUpdate={handleBulkStockUpdate}
        onCategoryUpdate={handleBulkCategoryUpdate}
        getCategoryName={getCategoryName}
      />

      <ProductCategoryModal
        open={isCategoryModalOpen}
        categories={categories}
        categoryForm={categoryForm}
        catNameError={catNameError}
        updating={updating}
        onClose={() => { setIsCategoryModalOpen(false); setCatNameError(false); setCategoryForm(emptyCategoryForm()); }}
        onFormChange={setCategoryForm}
        onCatNameErrorChange={setCatNameError}
        onSubmit={handleSaveCategory}
        onEditCategory={openCategoryModal}
        onDeleteCategory={(id: string, name: string) => { setConfirmDeleteCategory({ id, name }); }}
        getCategoryName={getCategoryName}
      />

      <DeleteAllModal
        open={confirmDeleteAll}
        updating={updating}
        onClose={() => setConfirmDeleteAll(false)}
        onConfirm={handleDeleteAll}
      />

      <DeleteProductModal
        product={confirmDeleteProduct}
        updating={false}
        onClose={() => setConfirmDeleteProduct(null)}
        onConfirm={confirmDeleteProductAction}
      />

      <DeleteCategoryModal
        category={confirmDeleteCategory}
        loading={loading}
        onClose={() => setConfirmDeleteCategory(null)}
        onConfirm={confirmDeleteCategoryAction}
      />
    </div>
  );
};

export default ProductsPage;
