'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { supabase } from '@/lib/supabase';
import { Product, Category } from '@/types';
import {
  Zap, BrainCircuit, Sparkles
} from 'lucide-react';
import HeroBanner from './widgets/HeroBanner';
import LiveFloorSnapshot from './widgets/LiveFloorSnapshot';
import DashboardProductModal from './widgets/DashboardProductModal';
import { HappyHourModal, DeleteProductModal } from './widgets/DashboardModals';
import { toast } from '@/lib/toast';
import { useLanguage, interpolateTemplate } from '@/lib/i18n/LanguageContext';

const AdminDashboard = () => {
  const { t, language } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayAov, setTodayAov] = useState<number | null>(null);
  const [role, setRole] = useState<'admin' | 'superadmin' | null>(null);
  const [updating, setUpdating] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const didAutoTranslate = React.useRef(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<{ id: string; name: string } | null>(null);
  const [isHappyHourModalOpen, setIsHappyHourModalOpen] = useState(false);
  const [openingHours, setOpeningHours] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [happyHourForm, setHappyHourForm] = useState({
    discountPercent: 20,
    productId: '',
    start_time: '12:00',
    end_time: '18:00'
  });

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

  const fetchData = useDebounce(async () => {
    setLoading(true);
    try {
        const res = await fetch('/api/dashboard');
        if (!res.ok) {
            throw new Error(`API responded with status: ${res.status}`);
        }
        const data = await res.json();

        setTodayAov(data.todayAov || 0);
        setProducts(Array.isArray(data.products) ? data.products : []);
        setCategories(Array.isArray(data.categories) ? data.categories : []);
        if (data.openingHours) setOpeningHours(data.openingHours);
        setSettingsLoaded(true);

        if (data.categories?.length > 0 && !productForm.category_id) {
            setProductForm(prev => ({ ...prev, category_id: data.categories[0].id }));
        }
        if (data.products?.length > 0) {
            setHappyHourForm(prev => ({ ...prev, productId: data.products[0].id }));
        }
    } catch (error: any) {
        console.error("Dashboard fetch error:", error);
        toast.error('Məlumatları yükləmək mümkün olmadı: ' + error.message, { id: 'action-toast' });
        setProducts([]);
        setCategories([]);
        setTodayAov(0);
        setSettingsLoaded(true);
    } finally {
        setLoading(false);
    }
}, 300);

  useEffect(() => {
    setRole(localStorage.getItem('saito_admin_role') as 'admin' | 'superadmin' | null);
    fetchData();
  }, [fetchData]);


  const yojiAdvice = useMemo(() => {
    if (!products || products.length === 0) return null;

    const advices: Array<{ priority: number; title: string; text: string; type: string; productId?: string; }> = [];
    const currentHour = new Date().getHours();

    if (role === 'admin') {
      if (currentHour >= 18 && currentHour <= 21) {
        advices.push({ priority: 0, title: t('peak_hour_start'), text: t('peak_hour_service_text'), type: 'SERVICE' });
      }
    } else {
      if (todayAov !== null && todayAov > 0) {
        if (todayAov < 25) {
          advices.push({ priority: 0, title: t('aov_low'), text: interpolateTemplate(t('aov_low_text'), { amount: todayAov.toFixed(0) }), type: 'UPSELL' });
        }
      }
    }

    return advices.sort((a, b) => a.priority - b.priority)[0] || null;
  }, [products, todayAov, role, language, t]);

  return (
    <div className="flex flex-col gap-y-4 pb-4 lg:pb-20 overflow-visible">
      <HeroBanner />
      {loading ? (
        <div className="flex items-center justify-center p-8"><Zap size={24} className="animate-pulse text-gray-400" /></div>
      ) : (
        <>
          {settingsLoaded && (
            <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
             {yojiAdvice ? (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                    <Sparkles size={14} className="text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gold/70">{yojiAdvice.title}</span>
                    <p className="text-sm text-[var(--theme-text-secondary)] truncate">{yojiAdvice.text}</p>
                  </div>
                  {yojiAdvice.productId && (
                    <button
                      onClick={() => {}}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-gold text-black shrink-0 hover:brightness-110 transition-all"
                    >
                      <Zap size={12} /> {t('apply')}
                    </button>
                  )}
                </div>
              ) : (
                 <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center shrink-0">
                        <BrainCircuit size={14} className="text-[var(--theme-text-muted)]" />
                    </div>
                    <p className="text-sm text-[var(--theme-text-muted)]">{t('ai_analyzing')}</p>
                </div>
              )}
            </div>
          )}
          <LiveFloorSnapshot />
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
