'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Product, Category, Campaign } from '@/types';
import { Plus, Trash2, Loader2, Sparkles } from 'lucide-react';
import { EmptyState, LoadingSkeleton } from '@/components/ui/primitives';
import CampaignCard from './components/CampaignCard';
import CampaignModal from './components/CampaignModal';
import { DeleteCampaignModal, DeleteAllCampaignsModal } from './components/CampaignModals';
import { toast } from '@/lib/toast';
import { CampaignsSkeleton } from './components/CampaignsSkeleton';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useMinimumLoadingTime } from '@/hooks/useMinimumLoadingTime';
import { motion } from 'framer-motion';

// Helper to interpolate translation templates with variables
/* ─── Helpers ─── */
const interpolateTemplate = (template: string, variables: Record<string, string | number>): string => {
  return template.replace(/\{(\w+)\}/g, (match, key) => String(variables[key] ?? match));
};

const CampaignsPage = () => {

  /* ─── Context ─── */
  const { t, language } = useLanguage();

  /* ─── Loading state ─── */
  const [rawLoading, setLoading] = useState(() => {
    try { return !localStorage.getItem('saito_campaigns_cache'); } catch { return true; }
  });
  // Enforce minimum loading time to prevent skeleton flicker
  const loading = useMinimumLoadingTime(rawLoading, 600);


  /* ─── AI helpers ─── */
  // AI Helper: Detect if category is drinks/beverages
  const isDrinkCategory = (categoryName?: string): boolean => {
    if (!categoryName) return false;
    const drinkKeywords = [
      'içki', 'içkilər', 'drink', 'drinks', 'beverage', 'beverages',
      'kokteyl', 'kokteyllər', 'cocktail', 'cocktails',
      'su', 'sular', 'water',
      'qəhvə', 'coffee', 'çay', 'tea',
      'alkoqol', 'alcohol', 'spirtli',
      'şirə', 'juice', 'meyvə şirəsi',
      'energetik', 'energy', 'gazlı', 'soda'
    ];
    const lower = categoryName.toLowerCase();
    return drinkKeywords.some(kw => lower.includes(kw));
  };

  // AI Helper: Get product type label
  const getProductTypeLabel = (product: Product): string => {
    const catName = product.category?.name || '';
    return isDrinkCategory(catName) ? 'drink' : 'food';
  };

  /* ─── Data state ─── */
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => {
    try { const r = localStorage.getItem('saito_campaigns_cache'); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [products, setProducts] = useState<Product[]>(() => {
    try { const r = localStorage.getItem('saito_products_cache'); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [categories, setCategories] = useState<Category[]>(() => {
    try { const r = localStorage.getItem('saito_categories_cache'); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);


  /* ─── Confirmation state ─── */
  const [confirmDeleteCampaign, setConfirmDeleteCampaign] = useState<{ id: string; title: string } | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  

  /* ─── Form state ─── */
  const [newCampaign, setNewCampaign] = useState<{
    title: string;
    title_en?: string;
    title_ru?: string;
    type: Campaign['type'];
    target_type: 'category' | 'product';
    target_id: string;
    discount_value: string;
    start_time: string;
    end_time: string;
    end_date: string;
    status: 'active' | 'inactive';
  }>({
    title: '',
    type: 'PERCENTAGE',
    target_type: 'product',
    target_id: '',
    discount_value: '',
    start_time: '12:00',
    end_time: '18:00',
    end_date: '',
    status: 'active'
  });
  

  /* ─── Search state ─── */
  const [productSearch, setProductSearch] = useState('');
  
  const filteredCampaignProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    return products.filter(p => 
      p.name.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [products, productSearch]);


  /* ─── Occupancy state ─── */
  const [occupancyStatus, setOccupancyStatus] = useState<{ isLow: boolean; activeTables: number; totalTables: number } | null>(null);
  const [currentHour, setCurrentHour] = useState(new Date().getHours());


  /* ─── Effects ─── */

  // Check current occupancy for Smart Happy Hour AI trigger
  useEffect(() => {
    const checkOccupancy = async () => {
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('table_number')
        .in('status', ['new', 'confirmed']);
      
      const { data: settings } = await supabase
        .from('settings')
        .select('qr_table_count')
        .eq('id', '1')
        .single();
      
      const activeTables = new Set(activeOrders?.map((o: any) => o.table_number).filter(Boolean)).size;
      const totalTables = settings?.qr_table_count || 12;
      const occupancyRate = activeTables / totalTables;
      
      setOccupancyStatus({
        isLow: occupancyRate < 0.3 && activeTables < 4,
        activeTables,
        totalTables
      });
    };
    
    checkOccupancy();
    const interval = setInterval(() => {
      checkOccupancy();
      setCurrentHour(new Date().getHours());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const searchParams = useSearchParams();

  /* ─── Data fetching ─── */
  useEffect(() => {
    fetchData();
  }, []);

  /* Auto-expire campaigns whose end_date has passed - runs every minute */
  useEffect(() => {
    const checkExpiry = async () => {
      if (campaigns.length === 0) return;

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Check date-based expiry
      const expired = campaigns.filter(
        c => c.status === 'active' && c.end_date && c.end_date <= today
      );

      // Check HAPPY_HOUR time-based expiry
      const expiredHappyHours = campaigns.filter(
        c => c.status === 'active' &&
             c.type === 'HAPPY_HOUR' &&
             c.end_time &&
             c.end_time < currentTime
      );

      const allExpired = [...expired, ...expiredHappyHours];

      for (const camp of allExpired) {
        await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deactivate', id: camp.id })
        });
      }

      if (allExpired.length > 0) {
        toast.success(`${allExpired.length} ${t('toast_campaigns_deactivated')}`, { id: 'action-toast' });
        fetchData();
      }
    };

    // Check immediately when campaigns load
    checkExpiry();

    // Check every minute for ongoing expiry
    const interval = setInterval(checkExpiry, 60000);
    return () => clearInterval(interval);
  }, [campaigns]);


  const fetchData = async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (!res.ok) throw new Error('API xətası');
      const data = await res.json();
      
      setCampaigns(data || []);
      try { localStorage.setItem('saito_campaigns_cache', JSON.stringify(data || [])); } catch {}
    } catch (error: any) {
      toast.error('Məlumatlar yüklənmədi: ' + error.message, { id: 'action-toast' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    setConfirmDeleteAll(true);
  };

  const confirmDeleteAllAction = async () => {
    setConfirmDeleteAll(false);
    setLoading(true);
    try {
      // 1. Reset all product discount prices
      const { error: resetError } = await supabase.from('products').update({ discount_price: null }).neq('id', '00000000-0000-0000-0000-000000000000'); // Dummy condition to target all
      if (resetError) throw resetError;

      // 2. Delete all campaigns
      const { error: deleteError } = await supabase.from('campaigns').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (deleteError) throw deleteError;

      toast.success(t('all_campaigns_deleted'), { id: 'action-toast' });
      fetchData();
    } catch (error: any) {
      toast.error(t('error') + ': ' + error.message, { id: 'action-toast' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    setConfirmDeleteCampaign({ id, title });
  };

  const confirmDeleteCampaignAction = async () => {
    if (!confirmDeleteCampaign) return;
    const { id } = confirmDeleteCampaign;
    setConfirmDeleteCampaign(null);
    
    try {
      // Get the campaign details before deleting
      const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', id).single();
      
      if (campaign && campaign.status === 'active') {
        if (campaign.target_type === 'product') {
          // Reset discount price for specific product
          await supabase.from('products').update({ discount_price: null }).eq('id', campaign.target_id);
        } else if (campaign.target_type === 'category') {
          // Reset discount price for all products in category
          await supabase.from('products').update({ discount_price: null }).eq('category_id', campaign.target_id);
        }
      }

      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;

      toast.success(t('campaign_deleted'), { id: 'action-toast' });
      fetchData();
    } catch (error: any) {
      toast.error(t('error') + ': ' + error.message, { id: 'action-toast' });
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.target_id) {
      toast.error('Hədəf seçilməyib', { id: 'action-toast' });
      return;
    }

    setIsSubmitting(true);
    try {
      // If it's a happy hour, deactivate all previous happy hour campaigns
      if (newCampaign.type === 'HAPPY_HOUR' && newCampaign.status === 'active') {
        // Reset discount prices for products that were in happy hour
        const { data: oldHappyHours } = await supabase.from('campaigns').select('target_id, target_type').eq('type', 'HAPPY_HOUR').eq('status', 'active');
        if (oldHappyHours) {
          for (const ohh of oldHappyHours) {
            if (ohh.target_type === 'product') {
              await supabase.from('products').update({ discount_price: null }).eq('id', ohh.target_id);
            } else if (ohh.target_type === 'category') {
              await supabase.from('products').update({ discount_price: null }).eq('category_id', ohh.target_id);
            }
          }
        }
        await supabase.from('campaigns').update({ status: 'inactive' }).eq('type', 'HAPPY_HOUR');
      }

      const campaignData = {
        title: newCampaign.title,
        translations: { en: { title: newCampaign.title_en || '' }, ru: { title: newCampaign.title_ru || '' } },
        type: newCampaign.type,
        target_type: newCampaign.target_type,
        target_id: newCampaign.target_id,
        discount_value: (newCampaign.type === 'PERCENTAGE' || newCampaign.type === 'HAPPY_HOUR') ? parseFloat(newCampaign.discount_value) : null,
        start_time: newCampaign.type === 'HAPPY_HOUR' ? newCampaign.start_time : null,
        end_time: newCampaign.type === 'HAPPY_HOUR' ? newCampaign.end_time : null,
        end_date: newCampaign.end_date || null,
        status: newCampaign.status
      };

      const { error } = await supabase.from('campaigns').insert([campaignData]);
      if (error) throw error;

      // If it's a percentage discount or happy hour, we might want to update the products directly
      if ((newCampaign.type === 'PERCENTAGE' || newCampaign.type === 'HAPPY_HOUR') && newCampaign.status === 'active') {
        const discountPercent = parseFloat(newCampaign.discount_value);
        if (newCampaign.target_type === 'product') {
          const product = products.find(p => p.id === newCampaign.target_id);
          if (product) {
            const newPrice = product.price * (1 - discountPercent / 100);
            await supabase.from('products').update({ discount_price: newPrice }).eq('id', product.id);
          }
        } else {
          // Category-wide discount
          const catProducts = products.filter(p => p.category_id === newCampaign.target_id);
          for (const p of catProducts) {
            const newPrice = p.price * (1 - discountPercent / 100);
            await supabase.from('products').update({ discount_price: newPrice }).eq('id', p.id);
          }
        }
      }

      toast.success(t('campaign_created'), { id: 'action-toast' });
      setIsModalOpen(false);
      setNewCampaign({
        title: '',
        type: 'PERCENTAGE',
        target_type: 'product',
        target_id: products[0]?.id || '',
        discount_value: '',
        start_time: '12:00',
        end_time: '18:00',
        end_date: '',
        status: 'active'
      });
      fetchData();
    } catch (error: any) {
      toast.error('Xəta: ' + error.message, { id: 'action-toast' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const EMPTY_FORM = {
    title: '',
    title_en: '',
    title_ru: '',
    type: 'PERCENTAGE' as Campaign['type'],
    target_type: 'product' as const,
    target_id: '',
    discount_value: '',
    start_time: '12:00',
    end_time: '18:00',
    end_date: '',
    status: 'active' as const,
  };

  const handleNewCampaign = () => {
    setCampaign(null);
    setNewCampaign(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setCampaign(campaign);
    setNewCampaign({
      title: campaign.title,
      title_en: (campaign as any).title_en || '',
      title_ru: (campaign as any).title_ru || '',
      type: campaign.type,
      target_type: campaign.target_type,
      target_id: campaign.target_id,
      discount_value: campaign.discount_value?.toString() || '',
      start_time: campaign.start_time || '12:00',
      end_time: campaign.end_time || '18:00',
      end_date: campaign.end_date || '',
      status: campaign.status
    });
    setIsModalOpen(true);
  };

  const handleUpdateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.target_id) {
      toast.error('Hədəf seçilməyib', { id: 'action-toast' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('campaigns').update({
        title: newCampaign.title,
        translations: { en: { title: newCampaign.title_en || '' }, ru: { title: newCampaign.title_ru || '' } },
        type: newCampaign.type,
        target_type: newCampaign.target_type,
        target_id: newCampaign.target_id,
        discount_value: (newCampaign.type === 'PERCENTAGE' || newCampaign.type === 'HAPPY_HOUR') ? parseFloat(newCampaign.discount_value) : null,
        start_time: newCampaign.type === 'HAPPY_HOUR' ? newCampaign.start_time : null,
        end_time: newCampaign.type === 'HAPPY_HOUR' ? newCampaign.end_time : null,
        end_date: newCampaign.end_date || null,
        status: newCampaign.status
      }).eq('id', campaign?.id);
      if (error) throw error;

      toast.success(t('campaign_updated'), { id: 'action-toast' });
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error('Xəta: ' + error.message, { id: 'action-toast' });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ─── Render ─── */
  if (loading) {
    return <CampaignsSkeleton />;
  }

  return (
    <div className="relative pb-4 md:pb-20">
      <div className="pointer-events-none fixed top-0 right-[15%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.05),transparent_65%)] blur-3xl" />
      <div className="pointer-events-none fixed bottom-[10%] left-[5%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02),transparent_65%)] blur-3xl" />

      {/* ── Header ── */}
      <div className="mb-6 md:mb-12 px-4 sm:px-0">
        {/* Mobile layout */}
        <div className="flex flex-col gap-3 md:hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-serif font-bold text-[var(--theme-text)] tracking-tight">{t('campaigns_title')}</h2>
            <button
              onClick={handleDeleteAll}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-500/[0.07] text-red-400/60 border border-red-500/15 transition-all active:scale-95"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <button
            onClick={handleNewCampaign}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl text-[12px] font-bold tracking-wider uppercase transition-all active:scale-95"
            style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)', color: '#D4AF37' }}
          >
            <Plus size={14} />
            {t('new_campaign')}
          </button>
        </div>
        {/* Desktop layout */}
        <div className="hidden md:flex items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-serif font-bold text-[var(--theme-text)] tracking-tight">{t('campaigns_title')}</h2>
            <p className="text-[var(--theme-text-secondary)] text-[10px] uppercase tracking-[0.25em] mt-0.5">{t('campaigns_subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteAll}
              className="px-5 py-3 flex items-center gap-2 rounded-xl bg-red-500/[0.08] hover:bg-red-500/20 text-red-400/70 hover:text-red-400 border border-red-500/15 hover:border-red-500/40 transition-all text-[11px] font-bold tracking-[0.18em] uppercase"
            >
              <Trash2 size={16} />
              {t('delete_all_campaigns')}
            </button>
            <button
              onClick={handleNewCampaign}
              className="flex items-center gap-2 px-8 py-3 rounded-xl text-[11px] font-bold tracking-[0.2em] uppercase transition-all active:scale-95"
              style={{ background: 'transparent', border: '1px solid #D4AF37', color: '#D4AF37' }}
            >
              <Plus size={15} />
              {t('new_campaign')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Campaign list ── */}
      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={20} />}
          title={t('no_active_campaigns_empty')}
          description={t('campaigns_subtitle')}
          action={
            <button
              onClick={handleNewCampaign}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)] font-bold text-[11px] uppercase tracking-widest hover:brightness-95 transition-all"
            >
              <Plus size={14} />
              {t('new_campaign')}
            </button>
          }
        />
      ) : (
        <>
          {(() => {
            const sorted = [...campaigns].sort((a, b) =>
              a.status === b.status ? 0 : a.status === 'active' ? -1 : 1
            );
            return (
              <>
                {/* Mobile: flat list */}
                <div className="lg:hidden space-y-4 px-4">
                  {sorted.map((camp) => (
                    <CampaignCard key={camp.id} camp={camp} products={products} categories={categories} onEdit={handleEditCampaign} onDelete={handleDelete} />
                  ))}
                </div>
                {/* Desktop: grid */}
                <div className="hidden lg:grid grid-cols-3 gap-8">
                  {sorted.map((camp) => (
                    <CampaignCard key={camp.id} camp={camp} products={products} categories={categories} onEdit={handleEditCampaign} onDelete={handleDelete} />
                  ))}
                </div>
              </>
            );
          })()}
        </>
      )}

      <CampaignModal
        open={isModalOpen}
        campaign={campaign}
        form={newCampaign}
        isSubmitting={isSubmitting}
        productSearch={productSearch}
        filteredProducts={filteredCampaignProducts}
        products={products}
        onClose={() => setIsModalOpen(false)}
        onFormChange={setNewCampaign}
        onProductSearch={setProductSearch}
        onSubmit={campaign ? handleUpdateCampaign : handleAdd}
      />

      <DeleteCampaignModal
        campaign={confirmDeleteCampaign}
        onConfirm={confirmDeleteCampaignAction}
        onCancel={() => setConfirmDeleteCampaign(null)}
      />

      <DeleteAllCampaignsModal
        open={confirmDeleteAll}
        loading={loading}
        onConfirm={confirmDeleteAllAction}
        onCancel={() => setConfirmDeleteAll(false)}
      />
    </div>
  );
};

export default CampaignsPage;
