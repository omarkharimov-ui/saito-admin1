'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Product, Category, Campaign } from '@/types';
import {
  Percent, Save, Trash2, Edit3, Loader2, Zap, X,
  Search, Filter, Plus, ChevronDown, BrainCircuit,
  TrendingUp, Sparkles, Settings as SettingsIcon, Star,
  Tag, Info, Upload, AlertCircle, Flame, MoreVertical
} from 'lucide-react';
import HeroBanner from './widgets/HeroBanner';
import LiveFloorSnapshot from './widgets/LiveFloorSnapshot';
import DashboardProductModal from './widgets/DashboardProductModal';
import { HappyHourModal, DeleteProductModal } from './widgets/DashboardModals';
import { toast } from 'react-hot-toast';
import { useLanguage, interpolateTemplate } from '@/lib/i18n/LanguageContext';
import GoldSelect from '@/components/GoldSelect';
import DashboardSkeleton from '@/components/DashboardSkeleton';

function SenseiSleepCard({ openingHours }: { openingHours: string }) {
  const [countdown, setCountdown] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    const getCountdown = () => {
      const match = openingHours.match(/^(\d{2}:\d{2})[\-–](\d{2}:\d{2})$/);
      if (!match) return null;
      const [oh, om] = match[1].split(':').map(Number);
      const now = new Date();
      const open = new Date(now);
      open.setHours(oh, om, 0, 0);
      if (open <= now) open.setDate(open.getDate() + 1);
      const diff = open.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      return { h, m, s };
    };

    setCountdown(getCountdown());
    const id = setInterval(() => setCountdown(getCountdown()), 1000);
    return () => clearInterval(id);
  }, [openingHours]);

  const openMatch = openingHours.match(/^(\d{2}:\d{2})[\-–](\d{2}:\d{2})$/);
  const openTime = openMatch?.[1];

  return (
    <div className="relative overflow-hidden rounded-xl bg-[#0a0a0a]">
      <div className="relative z-10 flex items-center gap-5 p-6">
        {/* Brain icon */}
        <div className="relative shrink-0 sensei-icon-calm">
          <div
            className="relative w-20 h-20 md:w-16 md:h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            {/* Animated Brain Circuit */}
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', zIndex: 1 }}>
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
              <path d="M9 13a4.5 4.5 0 0 0 3-4" /><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
              <path d="M3.477 10.896a4 4 0 0 1 .585-.396" /><path d="M6 18a4 4 0 0 1-1.967-.516" />
              <path d="M12 13h4" /><path d="M12 18h6a2 2 0 0 1 2 2v1" /><path d="M12 8h8" />
              <path d="M16 8V5a2 2 0 0 1 2-2" />
              {/* Animated circuit lines */}
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
                className="sensei-circuit-a"
                stroke="rgba(212,175,55,0.65)" strokeWidth="2" strokeDasharray="4 20"
                style={{ animation: 'circuitFlow 2.5s linear infinite' }} />
              <path d="M12 8h8M16 8V5a2 2 0 0 1 2-2M12 13h4M12 18h6a2 2 0 0 1 2 2v1"
                className="sensei-circuit-b"
                stroke="rgba(212,175,55,0.5)" strokeWidth="1.5" strokeDasharray="3 15"
                style={{ animation: 'circuitFlow 1.8s linear infinite reverse' }} />
            </svg>
          </div>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black tracking-[0.4em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
              SENSEI AI
            </span>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }} />
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-white/40">
              Yuxu rejimi
            </span>
          </div>

          {/* Countdown */}
          {countdown ? (
            <div>
              <p className="text-white/80 text-base leading-snug mb-2.5">
                <span className="font-serif italic text-white/50">Sensei </span>
                {countdown.h > 0 && (
                  <span className="font-mono font-black text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {countdown.h}<span className="text-sm font-bold text-white/40 ml-0.5">saat </span>
                  </span>
                )}
                <span className="font-mono font-black text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {String(countdown.m).padStart(2,'0')}<span className="text-sm font-bold text-white/40 ml-0.5">dəq </span>
                </span>
                <span className="font-mono font-bold text-base text-white/50">
                  {String(countdown.s).padStart(2,'0')}<span className="text-sm ml-0.5">san</span>
                </span>
                <span className="font-serif italic text-white/50"> sonra oyanacaq</span>
              </p>
              {openTime && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }} />
                  <span className="text-[11px] text-white/30">
                    Açılış: <span className="font-mono font-bold text-white/60">{openTime}</span>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-white/60 text-base font-serif italic">
              İş saatları başlayana qədər istirahət edirəm...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const AdminDashboard = () => {
  const { t, language, getProductTranslation, getCategoryTranslation } = useLanguage();
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
  const [todayAov, setTodayAov] = useState<number | null>(null);
  const [role, setRole] = useState<'admin' | 'superadmin' | null>(null);
  const [updating, setUpdating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const didAutoTranslate = React.useRef(false);
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<{ id: string; name: string } | null>(null);
  const [isHappyHourModalOpen, setIsHappyHourModalOpen] = useState(false);
  const [isHappyHourActive, setIsHappyHourActive] = useState(false);
  const [openingHours, setOpeningHours] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const isWithinBusinessHours = (): boolean => {
    if (!openingHours) return true;
    const match = openingHours.match(/^(\d{2}:\d{2})[\-–](\d{2}:\d{2})$/);
    if (!match) return true;
    const now = new Date();
    const [oh, om] = match[1].split(':').map(Number);
    const [ch, cm] = match[2].split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const openMins = oh * 60 + om;
    const closeMins = ch * 60 + cm;
    if (closeMins > openMins) return nowMins >= openMins && nowMins < closeMins;
    return nowMins >= openMins || nowMins < closeMins;
  };
  const [isAiDiscountModalOpen, setIsAiDiscountModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [aiDiscountForm, setAiDiscountForm] = useState({
    productId: '',
    productName: '',
    discountPercent: 15,
    type: 'PERCENTAGE',
    start_time: '12:00',
    end_time: '18:00'
  });

  const handleApplyAiDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    try {
      const product = products.find(p => p.id === aiDiscountForm.productId);
      if (product) {
        const discountPrice = product.price * (1 - aiDiscountForm.discountPercent / 100);
        await supabase.from('products').update({ discount_price: discountPrice }).eq('id', product.id);
        
        // Create campaign
        await supabase.from('campaigns').insert([{
          title: aiDiscountForm.type === 'HAPPY_HOUR' ? `${t('yoji_happy_hour')}: ${product.name}` : `${product.name} — ${t('yoji_tip')}`,
          target_type: 'product',
          target_id: product.id,
          type: aiDiscountForm.type,
          discount_value: aiDiscountForm.discountPercent,
          start_time: aiDiscountForm.type === 'HAPPY_HOUR' ? aiDiscountForm.start_time : null,
          end_time: aiDiscountForm.type === 'HAPPY_HOUR' ? aiDiscountForm.end_time : null,
          status: 'active'
        }]);

        toast.success(`"${product.name}" üçün ${aiDiscountForm.discountPercent}% endirim tətbiq edildi`);
        setIsAiDiscountModalOpen(false);
        setIsHappyHourModalOpen(false);
        fetchData();
      }
    } catch (err) {
      toast.error('Xəta baş verdi');
    }
    setUpdating(false);
  };

  const openAiDiscountModal = (productId: string, productName: string, discountPercent: number, type: string) => {
    setAiDiscountForm(prev => ({ ...prev, productId, productName, discountPercent, type }));
    setHappyHourForm(prev => ({ ...prev, productId, discountPercent }));
    setIsHappyHourModalOpen(true);
  };
  
  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState('all');

  // Happy Hour Form
  const [happyHourForm, setHappyHourForm] = useState({
    discountPercent: 20,
    productId: '',
    start_time: '12:00',
    end_time: '18:00'
  });

  // Multilingual Product Form State
  const [productForm, setProductForm] = useState({
    name: '',
    category_id: '',
    price: '',
    image_url: '',
    description: '',
    ingredients: '',
    is_in_stock: true,
    is_special: false,
    is_spicy: false,
    variants: [] as { id?: string; name: string; price: string; is_default: boolean; variant_type: 'olcu' | 'nov'; translations?: any }[],
    modifiers: [] as { id?: string; name: string; price: string; is_available: boolean }[]
  });

  useEffect(() => {
    setRole(localStorage.getItem('saito_admin_role') as 'admin' | 'superadmin' | null);
    fetchData();
  }, []);

  useEffect(() => {
    if (language === 'az' || products.length === 0 || didAutoTranslate.current) return;
    didAutoTranslate.current = true;
    autoTranslateMissing(language, products, categories);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const fetchDataInternal = async () => {
    try {
      // API route istifadə edirik (RLS recursion-dan qaçmaq üçün)
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('API xətası');
      
      const data = await res.json();
      
      setTodayAov(data.todayAov || 0);
      setProducts(Array.isArray(data.products) ? data.products : []);
      setCategories(Array.isArray(data.categories) ? data.categories : []);
      setIsHappyHourActive(data.isHappyHourActive);
      if (data.openingHours) setOpeningHours(data.openingHours);
      setSettingsLoaded(true);
      
      // Cache
      try { localStorage.setItem('saito_products_cache', JSON.stringify(data.products || [])); } catch {}
      try { localStorage.setItem('saito_categories_cache', JSON.stringify(data.categories || [])); } catch {}
      
      // Default selections
      if (data.categories?.length > 0 && !productForm.category_id) {
        setProductForm(prev => ({ ...prev, category_id: data.categories[0].id }));
      }
      if (data.products?.length > 0) {
        setHappyHourForm(prev => ({ ...prev, productId: data.products[0].id }));
      }
    } catch (error: any) {
      toast.error('Məlumatları yükləmək mümkün olmadı: ' + error.message);
    }
  };

  // Debounced version to prevent flickering
  const debouncedFetchData = useDebounce(() => {
    setLoading(true);
    fetchDataInternal().finally(() => setLoading(false));
  }, 300);

  // Export fetchData for external use (with debounce)
  const fetchData = debouncedFetchData;

  const isLikelyDrink = useMemo(() => {
    const safeCategories = Array.isArray(categories) ? categories : [];
    const cat = safeCategories.find(c => c.id === productForm.category_id);
    if (!cat) return false;
    const raw = `${cat.name} ${(cat as any).slug || ''}`;
    const haystack = raw.replace(/\u0130/g, 'i').replace(/\u0131/g, 'i').toLowerCase();
    return /i[\u00e7c]kil?|drink|beverage|i[\u00e7c]ecek|juice|soda|water|\bsu\b|[\u00e7c]ay|cay|tea|coffee|q[\u0259e]hv|kofe|[\u015f]ir[\u0259e]|limon|smoothie|milkshake|lemonade/.test(haystack);
  }, [productForm.category_id, categories]);

  const filteredProducts = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    return safeProducts.filter(p => {
      const nameStr = typeof p.name === 'string' ? p.name : (p.name as any)?.az || '';
      const matchesSearch = nameStr.toLowerCase().includes(searchQuery.toLowerCase());
      // Handle both direct category_id and nested category.id from Supabase join
      const productCatId = p.category_id || (p.category as any)?.id;
      const matchesCategory = activeCategoryId === 'all' || productCatId === activeCategoryId;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, activeCategoryId]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      setProductForm(prev => ({ ...prev, image_url: publicUrl }));
      toast.success('Şəkil uğurla yükləndi');
    } catch (error: any) {
      toast.error('Şəkil yüklənərkən xəta baş verdi: ' + error.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    
    setUpdating(true);
    const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
    
    if (error) {
      toast.error(t('product_not_deleted') + ': ' + error.message);
    } else {
      toast.success(t('product_deleted'));
      fetchData();
    }
    setUpdating(false);
    setIsDeleteModalOpen(false);
    setProductToDelete(null);
  };

  const handleToggleStock = async (product: Product) => {
    const { error } = await supabase
      .from('products')
      .update({ is_in_stock: !product.is_in_stock })
      .eq('id', product.id);

    if (error) {
      toast.error(t('status_not_updated'));
    } else {
      toast.success(product.is_in_stock ? t('product_removed') : t('product_restored'));
      fetchData();
    }
  };

  const haptic = (ms = 8) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.category_id) {
      toast.error(t('please_select_category'));
      return;
    }
    setUpdating(true);

    // Build ingredients array from comma-separated string
    const ingredientsArray = productForm.ingredients.split(',').map((i: string) => i.trim()).filter(Boolean);

    const productData = {
      name: productForm.name,
      category_id: productForm.category_id,
      price: parseFloat(productForm.price),
      image_url: productForm.image_url,
      description: productForm.description,
      ingredients: ingredientsArray,
      is_in_stock: productForm.is_in_stock,
      is_special: productForm.is_special,
      is_spicy: productForm.is_spicy,
      views_count: editingProduct ? editingProduct.views_count : 0
    };

    let error;
    let savedProduct = null;
    if (editingProduct) {
      const { error: err } = await supabase.from('products').update(productData).eq('id', editingProduct.id);
      error = err;
    } else {
      const { data, error: err } = await supabase.from('products').insert([productData]).select().single();
      error = err;
      savedProduct = data;
    }

    if (error) {
      toast.error(t('error_sql_update'));
    } else {
      const targetId = editingProduct ? editingProduct.id : savedProduct?.id;

      if (targetId) {
        // ─── Smart translate: only changed fields get re-translated ───
        try {
          const langToLabel: Record<string, string> = { az: 'Azerbaijani', en: 'English', ru: 'Russian' };
          const otherLangs = (['az', 'en', 'ru'] as const).filter(l => l !== language);
          const ingrStr = productForm.ingredients || '';

          // For edit: detect which fields actually changed vs saved DB values
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

          // Build only the fields that changed for translation
          const fieldsToTranslate: Record<string, string> = {};
          if (nameChanged) fieldsToTranslate.name = productForm.name;
          if (descChanged && productForm.description) fieldsToTranslate.description = productForm.description;
          if (ingrChanged && ingrStr) fieldsToTranslate.ingredients = ingrStr;

          // Which langs are missing name (always need those)
          const missingLangs = otherLangs.filter(l => !flat[`name_${l}`]);
          // Which langs need updates for changed fields
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
            // Fallback after 3 failed attempts
            if (nameChanged) {
              if (!flat.name_az) flat.name_az = productForm.name;
              if (!flat.name_en) flat.name_en = productForm.name;
              if (!flat.name_ru) flat.name_ru = productForm.name;
            }
          }
          await supabase.from('products').update(flat).eq('id', targetId);
        } catch { /* silent */ }

        // ─── Save variants ───
        await supabase.from('product_variants').delete().eq('product_id', targetId).eq('variant_type', 'olcu');
        if (productForm.variants.length > 0) {
          await supabase.from('product_variants').insert(
            productForm.variants.map(v => ({
              product_id: targetId,
              name: v.name,
              price: parseFloat(v.price) || 0,
              is_default: v.is_default,
              variant_type: 'olcu',
              translations: v.translations
            }))
          );
        }

        // ─── Save modifiers ───
        await supabase.from('product_modifiers').delete().eq('product_id', targetId);
        if (productForm.modifiers.length > 0) {
          await supabase.from('product_modifiers').insert(
            productForm.modifiers.map(m => ({
              product_id: targetId,
              name: m.name,
              price: parseFloat(m.price) || 0,
              is_available: m.is_available
            }))
          );
        }
      }

      toast.success(editingProduct ? t('product_updated') : t('product_added'));
      setIsModalOpen(false);
      setEditingProduct(null);
      resetProductForm();
      fetchData();
    }
    setUpdating(false);
  };

  const handleApplyHappyHour = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    
    const product = products.find(p => p.id === happyHourForm.productId);
    
    if (product) {
      const discountPrice = product.price * (1 - happyHourForm.discountPercent / 100);
      try {
        // Deactivate existing happy hour campaigns and reset prices
        const { data: oldHappyHours } = await supabase.from('campaigns').select('target_id, target_type').eq('type', 'HAPPY_HOUR').eq('status', 'active');
        if (oldHappyHours) {
          for (const ohh of oldHappyHours) {
            if (ohh.target_type === 'product') {
              await supabase.from('products').update({ discount_price: null }).eq('id', ohh.target_id);
            }
          }
        }
        await supabase.from('campaigns').update({ status: 'inactive' }).eq('type', 'HAPPY_HOUR');
        
        await supabase.from('products').update({ discount_price: discountPrice }).eq('id', product.id);
        
        // Create a campaign entry for this happy hour
        await supabase.from('campaigns').insert([{
          title: `${t('yoji_happy_hour')}: ${product.name}`,
          target_type: 'product',
          target_id: happyHourForm.productId,
          type: 'HAPPY_HOUR',
          start_time: happyHourForm.start_time,
          end_time: happyHourForm.end_time,
          status: 'active'
        }]);

        toast.success(`"${product.name}" üçün ${happyHourForm.discountPercent}% endirim tətbiq edildi`);
        setIsHappyHourModalOpen(false);
        fetchData();
      } catch (err) {
        toast.error('Endirim tətbiq edilərkən xəta baş verdi');
      }
    }
    setUpdating(false);
  };

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
    const flatLang = `name_${lang}`;
    // ─── Translate categories ───
    const catEntries = cats.filter(c => !(c as any)[flatLang]);
    const catResults = await Promise.all(catEntries.map(async (cat) => {
      const tr = await batchXlate({ name: cat.name });
      if (!tr.name) return null;
      await supabase.from('categories').update({ [`name_${lang}`]: tr.name }).eq('id', cat.id);
      return { id: cat.id, name: tr.name };
    }));
    const catUpdates: Record<string, string> = {};
    for (const r of catResults) { if (r) catUpdates[r.id] = r.name; }
    if (Object.keys(catUpdates).length > 0) setCategories(prev => prev.map(c => catUpdates[c.id] ? { ...c, [`name_${lang}`]: catUpdates[c.id] } : c));
    // ─── Translate products ───
    const prodEntries = prods.filter(p => !(p as any)[flatLang]);
    const prodResults = await Promise.all(prodEntries.map(async (product) => {
      const fields: Record<string, string> = { name: product.name };
      if (product.description) fields.description = product.description;
      const ingr = Array.isArray(product.ingredients) ? (product.ingredients as any[]).map((i: any) => (typeof i === 'string' ? i : i?.az || '')).filter(Boolean).join(', ') : '';
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

  const handleAiGenerate = async () => {
    if (!productForm.name.trim()) return;
    setAiGenerating(true);
    try {
      const res = await fetch('/api/sensei', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productName: productForm.name, ingredients: productForm.ingredients, language }) });
      const data = await res.json();
      if (data.description) setProductForm(prev => ({ ...prev, description: (data.description as string).slice(0, 150) }));
      else toast.error('Sensei cavab vermədi');
    } catch { toast.error('Sensei bağlantı xətası'); }
    finally { setAiGenerating(false); }
  };

  const resetProductForm = () => {
    setProductForm({
      name: '',
      category_id: categories[0]?.id || '',
      price: '',
      image_url: '',
      description: '',
      ingredients: '',
      is_in_stock: true,
      is_special: false,
      is_spicy: false,
      variants: [],
      modifiers: []
    });
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);

    // Use current UI language — same as desktop
    const localName = (product as any)[`name_${language}`] || product.name;
    const localDesc = (product as any)[`description_${language}`] || (typeof product.description === 'string' ? product.description : (product.description as any)?.az || '');
    const ingrRaw = product.ingredients || [];
    const localIngr = (product as any)[`ingredients_${language}`] || (Array.isArray(ingrRaw) ? ingrRaw.map((i: any) => (typeof i === 'string' ? i : i?.az || '')).filter(Boolean).join(', ') : '');

    const productVariants = (product as any).variants?.filter((v: any) => v.variant_type === 'olcu').map((v: any) => ({
      id: v.id,
      name: (v.translations?.[language]?.name) || v.name || '',
      price: v.price?.toString() || '',
      is_default: v.is_default || false,
      variant_type: 'olcu' as const,
      translations: v.translations || null
    })) || [];

    const productModifiers = (product as any).modifiers?.map((m: any) => ({
      id: m.id,
      name: m.name || '',
      price: m.price?.toString() || '0',
      is_available: m.is_available !== false
    })) || [];

    setProductForm({
      name: localName,
      category_id: product.category_id,
      price: product.price.toString(),
      image_url: product.image_url,
      description: localDesc,
      ingredients: localIngr,
      is_in_stock: product.is_in_stock,
      is_special: product.is_special || false,
      is_spicy: product.is_spicy || false,
      variants: productVariants,
      modifiers: productModifiers
    });
    setIsModalOpen(true);
  };

  // AI Suggestions Logic - YojiLogic 3.0
  const yojiAdvice = useMemo(() => {
    if (products.length === 0) return null;

    const advices: Array<{
      priority: number;
      title: string;
      text: string;
      type: string;
      productId?: string;
    }> = [];

    const currentHour = new Date().getHours();

    // 0. Role-based priority advice
    if (role === 'admin') {
      // Service-focused: wait times, peak hour readiness
      if (currentHour >= 18 && currentHour <= 21) {
        advices.push({ priority: 0, title: t('peak_hour_start'), text: t('peak_hour_service_text'), type: 'SERVICE' });
      } else if (currentHour >= 12 && currentHour <= 14) {
        advices.push({ priority: 0, title: t('lunch_peak_title'), text: t('lunch_peak_service_text'), type: 'SERVICE' });
      }
    } else {
      // SUPERADMIN: financial advice
      if (todayAov !== null && todayAov > 0) {
        if (todayAov >= 60) {
          advices.push({ priority: 0, title: t('customer_delight'), text: interpolateTemplate(t('customer_delight_text'), { amount: todayAov.toFixed(0) }), type: 'REWARD' });
        } else if (todayAov < 25) {
          advices.push({ priority: 0, title: t('aov_low'), text: interpolateTemplate(t('aov_low_text'), { amount: todayAov.toFixed(0) }), type: 'UPSELL' });
        }
      }
    }

    // 1. Out of stock (Priority 1)
    const outOfStock = products.filter(p => !p.is_in_stock);
    if (outOfStock.length > 0) {
      advices.push({
        priority: 1,
        title: t('stock_warning'),
        text: `"${outOfStock[0].name}" ${t('and_other_products')} ${outOfStock.length} ${t('products_out_of_stock')}. ${t('dont_forget_restock')}`,
        type: 'STOCK'
      });
    }

    // 2. High interest no discount (Priority 2)
    const highInterest = products
      .filter(p => p.is_in_stock && !p.discount_price && (p.views_count || 0) > 30)
      .sort((a, b) => (b.views_count || 0) - (a.views_count || 0));
    if (highInterest.length > 0) {
      advices.push({
        priority: 2,
        title: t('high_potential'),
        text: interpolateTemplate(t('high_potential_text'), { name: highInterest[0].name, views: highInterest[0].views_count.toString() }),
        type: 'PERCENTAGE',
        productId: highInterest[0].id
      });
    }

    // 3. Peak hours (Priority 3)
    if (currentHour >= 12 && currentHour <= 15) {
      advices.push({
        priority: 3,
        title: t('lunch_peak'),
        text: t('lunch_peak_text'),
        type: 'HAPPY_HOUR'
      });
    } else if (currentHour >= 18 && currentHour <= 21) {
      advices.push({
        priority: 3,
        title: t('evening_peak'),
        text: t('evening_peak_text'),
        type: 'BOGO'
      });
    }

    // 4. Cold products (Priority 4)
    const coldProducts = products
      .filter(p => p.is_in_stock && (p.views_count || 0) < 5)
      .sort((a, b) => (a.views_count || 0) - (b.views_count || 0));
    if (coldProducts.length > 0) {
      advices.push({
        priority: 4,
        title: t('revival_needed'),
        text: `"${coldProducts[0].name}" ${t('revival_text')}`,
        type: 'PROMOTION'
      });
    }

    if (advices.length === 0) {
      return {
        priority: 99,
        title: t('yoji_motivation'),
        text: t('all_good'),
        type: 'MOTIVATION'
      };
    }
    return advices.sort((a, b) => a.priority - b.priority)[0];
  }, [products, todayAov, role, language, t]);

  return (
    <div className="flex flex-col gap-y-4 pb-4 lg:pb-20 overflow-visible">
      {/* Hero Banner - Greeting + Live Badge */}
      <HeroBanner />

      {/* Show skeleton when loading to prevent flickering */}
      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>

      {/* AI Suggestion Section - Yoji Məsləhəti (HeroBanner və Canlı Masa Planı arasında) */}
      {!settingsLoaded ? (
        <div className="rounded-2xl h-[96px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
      ) : isWithinBusinessHours() ? (
        <>
          {/* DESKTOP — Yoji AI Advice Card */}
          <div
            className="hidden lg:block p-8 relative z-10 group rounded-2xl overflow-hidden flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-start gap-6 relative z-0">
              <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
                {/* Pulse glow arxada */}
                <motion.span 
                  className="absolute inset-[8px] rounded-2xl blur-lg pointer-events-none z-0"
                  animate={{ 
                    backgroundColor: ['rgba(212,175,55,0)', 'rgba(212,175,55,0.4)', 'rgba(212,175,55,0)'],
                    scale: [1, 1.1, 1],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="absolute inset-[8px] rounded-2xl bg-gold text-black shadow-xl shadow-gold/20 flex items-center justify-center z-10">
                  {/* Animated Brain Circuit */}
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                    <path d="M9 13a4.5 4.5 0 0 0 3-4" /><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
                    <path d="M3.477 10.896a4 4 0 0 1 .585-.396" /><path d="M6 18a4 4 0 0 1-1.967-.516" />
                    <path d="M12 13h4" /><path d="M12 18h6a2 2 0 0 1 2 2v1" /><path d="M12 8h8" />
                    <path d="M16 8V5a2 2 0 0 1 2-2" />
                    {/* Animated circuit lines */}
                    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" 
                      stroke="rgba(0,0,0,0.9)" strokeWidth="2" strokeDasharray="5 25" 
                      style={{ animation: 'circuitFlow 2.5s linear infinite' }} />
                    <path d="M12 8h8M16 8V5a2 2 0 0 1 2-2M12 13h4M12 18h6a2 2 0 0 1 2 2v1" 
                      stroke="rgba(0,0,0,0.8)" strokeWidth="1.5" strokeDasharray="4 18" 
                      style={{ animation: 'circuitFlow 1.8s linear infinite reverse' }} />
                  </svg>
                </div>
              </div>
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-gold">{t('yoji_advice')}</span>
                  <Sparkles size={14} className="text-gold" />
                </div>
                {yojiAdvice ? (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold tracking-[0.2em] uppercase mb-1 block text-gold/60">{yojiAdvice.title}</span>
                      <p className="text-xl font-serif italic leading-relaxed text-white/90">
                        &ldquo;{yojiAdvice.text}&rdquo;
                      </p>
                    </div>
                    {yojiAdvice.productId && (
                      <div className="flex-shrink-0 flex flex-col items-start md:items-end gap-2">
                        <span className="text-[10px] uppercase tracking-[0.25em] text-green-300/80">
                          {t('expected_growth')}: <span className="font-bold text-green-300">+15%</span>
                        </span>
                        <button
                          onClick={() => {
                            const product = products.find(p => p.id === yojiAdvice.productId);
                            if (!product) return;
                            openAiDiscountModal(product.id, product.name, 10, yojiAdvice.type === 'HAPPY_HOUR' ? 'HAPPY_HOUR' : 'PERCENTAGE');
                          }}
                          className="flex items-center gap-2 px-5 py-3 rounded-xl text-black text-xs font-bold tracking-widest uppercase transition-all transition-premium shadow-lg shadow-gold/10 bg-gradient-to-r from-gold via-[#E7C85A] to-gold border border-gold/30"
                        >
                          <Zap size={16} /> {t('apply')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xl font-serif italic leading-relaxed text-white/60">
                    {t('ai_analyzing')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* MOBILE — Glassmorphism Yoji card */}
          <div
            className="lg:hidden relative"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-gold/30 via-white/[0.06] to-transparent p-[1px]">
              <div className="w-full h-full rounded-2xl bg-[#080808]" />
            </div>
            <div className="absolute -top-6 -left-6 w-32 h-32 bg-gold/[0.07] rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-gold/[0.04] rounded-full blur-3xl pointer-events-none" />

            <div className="relative p-6 backdrop-blur-md rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4 mb-5">
                <div className="relative w-14 h-14 shrink-0 sensei-icon-calm">
                  <span
                    className="sensei-pulse-glow absolute inset-[4px] rounded-xl blur-sm pointer-events-none z-0"
                    style={{
                      background: 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, transparent 70%)',
                    }}
                  />
                  <div className="absolute inset-[4px] rounded-xl bg-gold text-black flex items-center justify-center z-10">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                      <path d="M9 13a4.5 4.5 0 0 0 3-4" /><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
                      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" /><path d="M6 18a4 4 0 0 1-1.967-.516" />
                      <path d="M12 13h4" /><path d="M12 18h6a2 2 0 0 1 2 2v1" /><path d="M12 8h8" />
                      <path d="M16 8V5a2 2 0 0 1 2-2" />
                      <path
                        className="sensei-circuit-a"
                        d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
                        stroke="rgba(0,0,0,0.85)" strokeWidth="2" strokeDasharray="5 25"
                        style={{ animation: 'circuitFlow 2.5s linear infinite' }}
                      />
                      <path
                        className="sensei-circuit-b"
                        d="M12 8h8M16 8V5a2 2 0 0 1 2-2M12 13h4M12 18h6a2 2 0 0 1 2 2v1"
                        stroke="rgba(0,0,0,0.75)" strokeWidth="1.5" strokeDasharray="4 18"
                        style={{ animation: 'circuitFlow 1.8s linear infinite reverse' }}
                      />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[11px] font-bold text-gold tracking-[0.2em] uppercase">{t('yoji_advice')}</h4>
                  {yojiAdvice && (
                    <span className="text-[10px] font-medium text-green-400/80 mt-0.5 block">{t('high_potential')}</span>
                  )}
                </div>
                {yojiAdvice && (
                  <span className="text-sm font-bold text-green-400 shrink-0">+15%</span>
                )}
              </div>

              {yojiAdvice ? (
                <>
                  <p className="text-white/70 text-[15px] italic font-serif leading-[1.7] mb-8">
                    &ldquo;{yojiAdvice.text}&rdquo;
                  </p>
                  {yojiAdvice.productId && (
                    <button
                      onClick={() => {
                        const product = products.find(p => p.id === yojiAdvice.productId);
                        if (!product) return;
                        openAiDiscountModal(product.id, product.name, 10, yojiAdvice.type === 'HAPPY_HOUR' ? 'HAPPY_HOUR' : 'PERCENTAGE');
                      }}
                      className="group relative flex items-center justify-center gap-2.5 w-full h-[52px] rounded-xl border border-gold/40 text-gold text-xs font-bold tracking-[0.2em] uppercase overflow-hidden transition-all hover:border-gold/60 active:scale-[0.98]"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-gold/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                      <Zap size={17} className="relative z-10" />
                      <span className="relative z-10">{t('apply')}</span>
                    </button>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl border border-white/[0.08] flex items-center justify-center">
                    <BrainCircuit size={18} className="text-white/30" />
                  </div>
                  <p className="text-white/30 text-[15px] italic font-serif leading-relaxed">
                    {t('ai_analyzing')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <SenseiSleepCard openingHours={openingHours} />
      )}

      {/* Live Floor Snapshot - Canlı Masa Planı (Yoji Məsləhəti altında) */}
      <LiveFloorSnapshot />

      {/* Product Modal */}
      <DashboardProductModal
        open={isModalOpen}
        editingProduct={editingProduct}
        productForm={productForm}
        categories={categories}
        isLikelyDrink={isLikelyDrink}
        updating={updating}
        aiGenerating={aiGenerating}
        onClose={() => { setIsModalOpen(false); setEditingProduct(null); }}
        onFormChange={setProductForm}
        onSubmit={handleSaveProduct}
        onAiGenerate={handleAiGenerate}
      />

      {/* Happy Hour Modal */}
      <HappyHourModal
        open={isHappyHourModalOpen}
        onClose={() => setIsHappyHourModalOpen(false)}
        form={happyHourForm}
        onFormChange={setHappyHourForm}
        onSubmit={handleApplyHappyHour}
        products={products}
        updating={updating}
      />

      {/* Delete Product Modal */}
      <DeleteProductModal
        open={!!confirmDeleteProduct}
        product={confirmDeleteProduct}
        updating={updating}
        onClose={() => setConfirmDeleteProduct(null)}
        onConfirm={async () => {
          if (!confirmDeleteProduct) return;
          try {
            await supabase.from('products').delete().eq('id', confirmDeleteProduct.id);
            toast.success(t('product_deleted'));
            fetchData();
          } catch { 
            toast.error(t('error')); 
          }
          setConfirmDeleteProduct(null);
        }}
      />
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
